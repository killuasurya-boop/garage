// =============================================================================
// PRODUCTION HUB — helper DB tingkat tiket (tanpa import garage-service supaya
// bisa dipakai dari createOrder / accept order / updateKitchenStatus tanpa
// siklus import).
// =============================================================================

import { and, eq, inArray, ne, notInArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  kitchenTickets,
  productionBatchAllocations,
  productionBatches,
  productionTicketItems,
} from "@/db/schema";
import { productionStationFor, type ProductionStation } from "@/lib/garage-production-rules";
import { schedulePartnerCancelNotice } from "@/lib/partner-hub-orders";

type GarageDb = ReturnType<typeof getDb>;
type GarageTx = Parameters<Parameters<GarageDb["transaction"]>[0]>[0];
type DbLike = GarageDb | GarageTx;

export type ProductionMenuInfo = {
  station: string | null;
  category: string | null;
  batchEligible: boolean;
};

export type ProductionOrderLine = {
  id: string;
  menuItemId: string | null;
  variantId: string;
  itemName: string;
  variantLabel: string;
  qty: number;
  note: string | null;
};

/**
 * Tulis production_ticket_items untuk tiket yang baru dibuat. Tiap baris order
 * masuk ke tiket station-nya (routing dari master produk) dengan snapshot
 * identitas order. Baris tanpa tiket station-nya dilewati.
 */
export async function insertProductionTicketItems(
  tx: DbLike,
  input: {
    order: { id: string; orderNo: string; tableLabel: string; customerName: string | null };
    tickets: Array<{ id: string; station: string }>;
    lines: ProductionOrderLine[];
    menuInfo: Map<string, ProductionMenuInfo>;
  },
) {
  const ticketByStation = new Map<ProductionStation, string>();
  for (const ticket of input.tickets) {
    ticketByStation.set(ticket.station === "Bar" ? "Bar" : "Food", ticket.id);
  }

  const rows = input.lines.flatMap((line) => {
    const info = line.menuItemId ? input.menuInfo.get(line.menuItemId) : undefined;
    const station = productionStationFor({
      station: info?.station,
      category: info?.category ?? "Makanan",
    });
    const ticketId = ticketByStation.get(station);
    if (!ticketId) return [];
    return [
      {
        ticketId,
        orderId: input.order.id,
        orderItemId: line.id,
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        itemName: line.itemName,
        variantLabel: line.variantLabel,
        qty: line.qty,
        note: line.note?.trim() || null,
        station,
        batchEligible: info?.batchEligible ?? true,
        customerName: input.order.customerName,
        tableLabel: input.order.tableLabel,
        orderNo: input.order.orderNo,
      },
    ];
  });

  if (rows.length) {
    await tx.insert(productionTicketItems).values(rows);
  }
  return rows.length;
}

export class ProductionBatchPendingError extends Error {
  constructor(public readonly batchNos: string[]) {
    super(
      `Tiket masih menunggu batch ${batchNos.join(", ")} selesai (allocation belum lengkap).`,
    );
    this.name = "ProductionBatchPendingError";
  }
}

/** Batch aktif (belum COMPLETE) yang masih memegang porsi tiket ini. */
export async function pendingBatchNosForTicket(db: DbLike, ticketId: string) {
  const rows = await db
    .select({ batchNo: productionBatches.batchNo })
    .from(productionTicketItems)
    .innerJoin(productionBatches, eq(productionTicketItems.batchId, productionBatches.id))
    .where(
      and(
        eq(productionTicketItems.ticketId, ticketId),
        eq(productionBatches.status, "processing"),
        ne(productionTicketItems.status, "ready"),
      ),
    );
  return [...new Set(rows.map((row) => row.batchNo))];
}

/**
 * Samakan status porsi dengan transisi tiket:
 *  - cooking: porsi WAITING non-batch → processing (MULAI individual)
 *  - ready  : semua porsi → ready (dipanggil setelah guard batch lolos)
 *  - reopen : porsi ready → processing (dikembalikan dengan alasan)
 */
export async function syncProductionItemsForTicket(
  db: DbLike,
  ticketId: string,
  transition: "cooking" | "ready" | "reopen",
  now = new Date(),
) {
  if (transition === "cooking") {
    await db
      .update(productionTicketItems)
      .set({ status: "processing" })
      .where(
        and(
          eq(productionTicketItems.ticketId, ticketId),
          eq(productionTicketItems.status, "waiting"),
        ),
      );
    return;
  }
  if (transition === "ready") {
    await db
      .update(productionTicketItems)
      .set({ status: "ready", readyAt: now })
      .where(
        and(
          eq(productionTicketItems.ticketId, ticketId),
          notInArray(productionTicketItems.status, ["ready", "cancelled"]),
        ),
      );
    return;
  }
  await db
    .update(productionTicketItems)
    .set({ status: "processing", readyAt: null })
    .where(
      and(
        eq(productionTicketItems.ticketId, ticketId),
        eq(productionTicketItems.status, "ready"),
      ),
    );
}

/**
 * Order dibatalkan (void): tiket yang belum diantar → "cancelled" (terminal),
 * porsinya ikut batal, dan porsi yang masih di batch berjalan dikeluarkan dari
 * batch (total batch dikurangi; batch tanpa porsi tersisa ikut dibatalkan).
 * Dipanggil DI DALAM transaksi void supaya konsisten.
 */
export async function cancelProductionForOrder(
  tx: DbLike,
  orderId: string,
  reason: string,
  now = new Date(),
) {
  const tickets = await tx
    .update(kitchenTickets)
    .set({ status: "cancelled", issueReason: reason, issueAt: now, updatedAt: now })
    .where(
      and(
        eq(kitchenTickets.orderId, orderId),
        inArray(kitchenTickets.status, ["queue", "cooking", "ready"]),
      ),
    )
    .returning({ id: kitchenTickets.id, ticketNo: kitchenTickets.ticketNo, partnerId: kitchenTickets.partnerId });
  // Smart Partner Hub: tiket mitra yang ikut batal → mitra diberi tahu (setelah transaksi tersimpan).
  schedulePartnerCancelNotice(tickets.filter((ticket) => ticket.partnerId).map((ticket) => ticket.ticketNo));
  // Porsi yang sudah diantar (tiket delivered) = sudah dibuat & dikonsumsi.
  const servedItems = await tx
    .select({ menuItemId: productionTicketItems.menuItemId, variantId: productionTicketItems.variantId, qty: productionTicketItems.qty })
    .from(productionTicketItems)
    .innerJoin(kitchenTickets, eq(productionTicketItems.ticketId, kitchenTickets.id))
    .where(
      and(
        eq(kitchenTickets.orderId, orderId),
        eq(kitchenTickets.status, "delivered"),
        ne(productionTicketItems.status, "cancelled"),
      ),
    );
  if (!tickets.length) {
    return {
      ticketNos: [] as string[],
      batchesTouched: 0,
      tracked: servedItems.length > 0,
      unmade: [] as ProductionQtyLine[],
      made: servedItems.map(toQtyLine),
    };
  }

  const ticketIds = tickets.map((ticket) => ticket.id);
  const items = await tx
    .select({
      id: productionTicketItems.id,
      batchId: productionTicketItems.batchId,
      qty: productionTicketItems.qty,
      status: productionTicketItems.status,
      menuItemId: productionTicketItems.menuItemId,
      variantId: productionTicketItems.variantId,
    })
    .from(productionTicketItems)
    .where(inArray(productionTicketItems.ticketId, ticketIds));
  const liveItems = items.filter((item) => item.status !== "cancelled");

  const qtyByBatch = new Map<string, number>();
  for (const item of items) {
    if (item.batchId) qtyByBatch.set(item.batchId, (qtyByBatch.get(item.batchId) ?? 0) + item.qty);
  }
  let batchesTouched = 0;
  for (const [batchId, qty] of qtyByBatch) {
    const [batch] = await tx
      .select({ status: productionBatches.status, totalQty: productionBatches.totalQty })
      .from(productionBatches)
      .where(eq(productionBatches.id, batchId))
      .limit(1);
    if (!batch || batch.status !== "processing") continue;
    await tx
      .delete(productionBatchAllocations)
      .where(
        and(
          eq(productionBatchAllocations.batchId, batchId),
          inArray(
            productionBatchAllocations.ticketItemId,
            items.filter((item) => item.batchId === batchId).map((item) => item.id),
          ),
        ),
      );
    const remaining = Math.max(0, batch.totalQty - qty);
    await tx
      .update(productionBatches)
      .set(
        remaining > 0
          ? { totalQty: remaining }
          : { totalQty: 0, status: "cancelled", completedAt: now },
      )
      .where(eq(productionBatches.id, batchId));
    batchesTouched += 1;
  }

  await tx
    .update(productionTicketItems)
    .set({ status: "cancelled", batchId: null })
    .where(inArray(productionTicketItems.ticketId, ticketIds));

  return {
    ticketNos: tickets.map((ticket) => ticket.ticketNo),
    batchesTouched,
    // Ada data porsi → stok dikembalikan hanya untuk yang belum dibuat.
    tracked: items.length > 0 || servedItems.length > 0,
    unmade: liveItems.filter((item) => item.status === "waiting").map(toQtyLine),
    made: [...liveItems.filter((item) => item.status !== "waiting"), ...servedItems].map(toQtyLine),
  };
}

export type ProductionQtyLine = { menuItemId: string | null; variantId: string; qty: number };

function toQtyLine(item: { menuItemId: string | null; variantId: string | null; qty: number }): ProductionQtyLine {
  return { menuItemId: item.menuItemId, variantId: item.variantId ?? "", qty: item.qty };
}

/** Tiket (id) yang seluruh porsinya sudah ready — kandidat auto READY. */
export async function fullyReadyTicketIds(db: DbLike, ticketIds: string[]) {
  if (!ticketIds.length) return [];
  const rows = await db
    .select({ ticketId: productionTicketItems.ticketId, status: productionTicketItems.status })
    .from(productionTicketItems)
    .where(inArray(productionTicketItems.ticketId, ticketIds));
  const live = rows.filter((row) => row.status !== "cancelled");
  const pending = new Set(live.filter((row) => row.status !== "ready").map((row) => row.ticketId));
  const withItems = new Set(live.map((row) => row.ticketId));
  return ticketIds.filter((id) => withItems.has(id) && !pending.has(id));
}

export async function ticketNosByIds(db: DbLike, ticketIds: string[]) {
  if (!ticketIds.length) return [];
  const rows = await db
    .select({ ticketNo: kitchenTickets.ticketNo })
    .from(kitchenTickets)
    .where(inArray(kitchenTickets.id, ticketIds));
  return rows.map((row) => row.ticketNo);
}

/**
 * Batalkan sebagian porsi produksi (bukan seluruh order): void satu bill hasil
 * split bill (tiketnya menumpang order induk) atau refund parsial. Porsi
 * dicocokkan per menu + varian di tiket order `ledgerOrderId` yang masih hidup,
 * mulai dari yang belum dibuat. Tiket tanpa porsi tersisa ikut "cancelled".
 */
export async function cancelProductionQuantities(
  tx: DbLike,
  input: {
    ledgerOrderId: string;
    lines: Array<{ menuItemId: string | null; variantId: string; qty: number }>;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const tickets = await tx
    .select({ id: kitchenTickets.id, ticketNo: kitchenTickets.ticketNo })
    .from(kitchenTickets)
    .where(
      and(
        eq(kitchenTickets.orderId, input.ledgerOrderId),
        inArray(kitchenTickets.status, ["queue", "cooking", "ready"]),
      ),
    );
  const [anyItem] = await tx
    .select({ id: productionTicketItems.id })
    .from(productionTicketItems)
    .innerJoin(kitchenTickets, eq(productionTicketItems.ticketId, kitchenTickets.id))
    .where(eq(kitchenTickets.orderId, input.ledgerOrderId))
    .limit(1);
  const tracked = Boolean(anyItem);
  const unmade: ProductionQtyLine[] = [];
  if (!tickets.length) {
    // Semua tiket sudah diantar / tidak ada → porsi yang diminta = sudah dibuat.
    return { ticketNos: [] as string[], cancelledQty: 0, tracked, unmade, made: tracked ? input.lines.map(toQtyLine) : [] };
  }
  const ticketIds = tickets.map((ticket) => ticket.id);
  const items = await tx
    .select()
    .from(productionTicketItems)
    .where(and(inArray(productionTicketItems.ticketId, ticketIds), ne(productionTicketItems.status, "cancelled")));
  // Yang belum dikerjakan dibatalkan duluan, lalu yang diproses, terakhir yang siap.
  const rank: Record<string, number> = { waiting: 0, processing: 1, ready: 2 };
  items.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));

  let cancelledQty = 0;
  for (const line of input.lines) {
    let remaining = line.qty;
    for (const item of items) {
      if (remaining <= 0) break;
      if (item.qty <= 0 || item.menuItemId !== line.menuItemId || item.variantId !== line.variantId) continue;
      const take = Math.min(item.qty, remaining);
      remaining -= take;
      cancelledQty += take;
      if (item.status === "waiting") unmade.push({ menuItemId: item.menuItemId, variantId: item.variantId ?? "", qty: take });
      item.qty -= take;
      if (item.batchId) {
        const [batch] = await tx
          .select({ status: productionBatches.status, totalQty: productionBatches.totalQty })
          .from(productionBatches)
          .where(eq(productionBatches.id, item.batchId))
          .limit(1);
        if (batch?.status === "processing") {
          const left = Math.max(0, batch.totalQty - take);
          await tx
            .update(productionBatches)
            .set(left > 0 ? { totalQty: left } : { totalQty: 0, status: "cancelled", completedAt: now })
            .where(eq(productionBatches.id, item.batchId));
        }
        await tx
          .delete(productionBatchAllocations)
          .where(eq(productionBatchAllocations.ticketItemId, item.id));
      }
      await tx
        .update(productionTicketItems)
        .set(item.qty > 0 ? { qty: item.qty, batchId: null } : { status: "cancelled", batchId: null })
        .where(eq(productionTicketItems.id, item.id));
      if (item.qty <= 0) item.status = "cancelled";
      else item.batchId = null;
    }
  }

  const touched: string[] = [];
  for (const ticket of tickets) {
    const live = items.filter((item) => item.ticketId === ticket.id && item.status !== "cancelled");
    const hadItems = items.some((item) => item.ticketId === ticket.id);
    if (hadItems && !live.length) {
      await tx
        .update(kitchenTickets)
        .set({ status: "cancelled", issueReason: input.reason, issueAt: now, updatedAt: now })
        .where(eq(kitchenTickets.id, ticket.id));
      touched.push(ticket.ticketNo);
      // Tiket mitra yang habis porsinya (batal item) → mitra diberi tahu; tiket non-mitra diabaikan di dalam.
      schedulePartnerCancelNotice([ticket.ticketNo]);
    } else if (live.length && cancelledQty > 0) {
      // Tiket tetap jalan dengan porsi tersisa; alasan tampil di kartu Bar/Dapur.
      await tx
        .update(kitchenTickets)
        .set({ issueReason: input.reason, issueAt: now, updatedAt: now })
        .where(eq(kitchenTickets.id, ticket.id));
      touched.push(ticket.ticketNo);
    }
  }
  // Yang bukan "belum dibuat" (sedang/sudah dibuat atau sudah diantar) = sudah dibuat.
  const made: ProductionQtyLine[] = [];
  if (tracked) {
    const key = (l: { menuItemId: string | null; variantId: string }) => `${l.menuItemId ?? ""}|${l.variantId}`;
    const requested = new Map<string, ProductionQtyLine>();
    for (const line of input.lines) {
      const current = requested.get(key(line));
      requested.set(key(line), { menuItemId: line.menuItemId, variantId: line.variantId, qty: (current?.qty ?? 0) + line.qty });
    }
    for (const [k, line] of requested) {
      const unmadeQty = unmade.filter((u) => key(u) === k).reduce((sum, u) => sum + u.qty, 0);
      if (line.qty - unmadeQty > 0) made.push({ ...line, qty: line.qty - unmadeQty });
    }
  }
  return { ticketNos: touched, cancelledQty, tracked, unmade, made };
}
