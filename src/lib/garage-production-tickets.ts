// =============================================================================
// PRODUCTION HUB — helper DB tingkat tiket (tanpa import garage-service supaya
// bisa dipakai dari createOrder / accept order / updateKitchenStatus tanpa
// siklus import).
// =============================================================================

import { and, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  kitchenTickets,
  productionBatchAllocations,
  productionBatches,
  productionTicketItems,
} from "@/db/schema";
import { productionStationFor, type ProductionStation } from "@/lib/garage-production-rules";

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
          ne(productionTicketItems.status, "ready"),
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
    .returning({ id: kitchenTickets.id, ticketNo: kitchenTickets.ticketNo });
  if (!tickets.length) return { ticketNos: [] as string[], batchesTouched: 0 };

  const ticketIds = tickets.map((ticket) => ticket.id);
  const items = await tx
    .select({
      id: productionTicketItems.id,
      batchId: productionTicketItems.batchId,
      qty: productionTicketItems.qty,
    })
    .from(productionTicketItems)
    .where(inArray(productionTicketItems.ticketId, ticketIds));

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

  return { ticketNos: tickets.map((ticket) => ticket.ticketNo), batchesTouched };
}

/** Tiket (id) yang seluruh porsinya sudah ready — kandidat auto READY. */
export async function fullyReadyTicketIds(db: DbLike, ticketIds: string[]) {
  if (!ticketIds.length) return [];
  const rows = await db
    .select({ ticketId: productionTicketItems.ticketId, status: productionTicketItems.status })
    .from(productionTicketItems)
    .where(inArray(productionTicketItems.ticketId, ticketIds));
  const pending = new Set(rows.filter((row) => row.status !== "ready").map((row) => row.ticketId));
  const withItems = new Set(rows.map((row) => row.ticketId));
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
