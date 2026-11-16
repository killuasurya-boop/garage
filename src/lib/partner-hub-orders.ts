// =============================================================================
// SMART PARTNER HUB — integrasi order (tanpa import garage-service, supaya bisa dipanggil
// dari createOrder / accept order tanpa siklus import).
// - Validasi server: produk mitra hanya boleh dijual bila hub aktif, mitra aktif+BUKA,
//   produk Tersedia, belum lewat last order, dan HPP sudah ditetapkan (PRD 06/16.3).
// - Tiket station "Mitra" per partner_id + production_ticket_items + partner_order_lines
//   (snapshot harga & HPP, UNIQUE per order_item → retry tidak menggandakan).
// =============================================================================

import { randomBytes } from "node:crypto";

import { and, desc, eq, inArray, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  kitchenTickets,
  partnerAdjustments,
  partnerEvents,
  partnerOrderLines,
  partnerPriceHistory,
  partnerProductLinks,
  partners,
  productionTicketItems,
} from "@/db/schema";
import { PARTNER_STATION, effectiveOperationalStatus, partnerOrderBlockReason, type PartnerServiceHours } from "@/lib/partner-hub-rules";

type GarageDb = ReturnType<typeof getDb>;
type GarageTx = Parameters<Parameters<GarageDb["transaction"]>[0]>[0];
type DbLike = GarageDb | GarageTx;

export type PartnerLinkInfo = {
  linkId: string;
  menuItemId: string;
  partnerId: string;
  partnerName: string;
  partnerStatus: string;
  operationalStatus: string;
  /** Data mentah untuk pemanggil yang menghitung ulang status dengan setelan outlet (menu). */
  rawOperationalStatus: string;
  operationalStatusAt: Date | null;
  lastSeenAt: Date | null;
  outletId: string;
  linkActive: boolean;
  lastOrderByDay: Record<string, string | null>;
  handoverPoint: string | null;
};

export class PartnerOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerOrderError";
  }
}

/** Link mitra untuk menu item yang dipesan (kosong bila tidak ada produk mitra). */
export async function loadPartnerLinks(db: DbLike, menuItemIds: string[], options: { heartbeatMinutes?: number; now?: Date } = {}) {
  const ids = [...new Set(menuItemIds.filter(Boolean))];
  const map = new Map<string, PartnerLinkInfo>();
  if (!ids.length) return map;
  const rows = await db
    .select({ link: partnerProductLinks, partner: partners })
    .from(partnerProductLinks)
    .innerJoin(partners, eq(partnerProductLinks.partnerId, partners.id))
    .where(inArray(partnerProductLinks.menuItemId, ids));
  for (const { link, partner } of rows) {
    map.set(link.menuItemId, {
      linkId: link.id,
      menuItemId: link.menuItemId,
      partnerId: partner.id,
      partnerName: partner.name,
      partnerStatus: partner.status,
      // Status yang berlaku: tutup otomatis saat ganti hari, "offline" bila portal mitra tidak terhubung.
      operationalStatus: effectiveOperationalStatus(
        { operationalStatus: partner.operationalStatus, operationalStatusAt: partner.operationalStatusAt, lastSeenAt: partner.lastSeenAt, heartbeatMinutes: options.heartbeatMinutes },
        options.now,
      ),
      rawOperationalStatus: partner.operationalStatus,
      operationalStatusAt: partner.operationalStatusAt,
      lastSeenAt: partner.lastSeenAt,
      outletId: partner.outletId,
      linkActive: link.active,
      lastOrderByDay: partner.lastOrderByDay ?? {},
      handoverPoint: partner.handoverPoint,
    });
  }
  return map;
}

/**
 * Tolak order bila ada produk mitra yang tidak boleh dijual. `productType === "partner"` tanpa link
 * juga ditolak (produk mitra yatim tidak boleh lolos sebagai produk Garage).
 */
export function assertPartnerItemsOrderable(
  lines: Array<{ itemId: string; itemName: string; productType?: string | null; stock?: string | null }>,
  links: Map<string, PartnerLinkInfo>,
  options: {
    hubEnabled: boolean;
    outletId: string;
    customerSelfOrder?: boolean;
    /** Jam layanan produk mitra outlet (Owner 16 Nov 2026). */
    serviceHours?: PartnerServiceHours | null;
    /** Acuan jam layanan; saat kasir menerima order pelanggan = waktu order dibuat. */
    at?: Date;
  },
) {
  for (const line of lines) {
    const link = links.get(line.itemId);
    if (!link && line.productType !== "partner") continue;
    if (options.customerSelfOrder) {
      // DEC-14: produk mitra hanya dipesan lewat waiter/kasir (menu digital = lihat saja).
      throw new PartnerOrderError(`${line.itemName} adalah produk mitra — pesan ke kasir atau waiter.`);
    }
    if (!link) throw new PartnerOrderError(`${line.itemName} belum terhubung ke mitra resmi.`);
    if (link.outletId !== options.outletId) throw new PartnerOrderError(`${line.itemName} bukan produk mitra outlet ini.`);
    const reason = partnerOrderBlockReason({
      hubEnabled: options.hubEnabled,
      partnerStatus: link.partnerStatus,
      operationalStatus: link.operationalStatus,
      linkActive: link.linkActive,
      productStock: line.stock,
      lastOrderByDay: link.lastOrderByDay,
      serviceHours: options.serviceHours,
      at: options.at,
    });
    if (reason) throw new PartnerOrderError(`${line.itemName}: ${reason}`);
  }
}

/** HPP & harga resmi terbaru per (link, varian) yang berlaku pada waktu `at`. */
async function currentPrices(db: DbLike, linkIds: string[], at: Date) {
  const map = new Map<string, { id: string; unitCost: number; sellPrice: number }>();
  if (!linkIds.length) return map;
  const rows = await db
    .select()
    .from(partnerPriceHistory)
    .where(and(inArray(partnerPriceHistory.linkId, linkIds), lte(partnerPriceHistory.effectiveFrom, at)))
    .orderBy(desc(partnerPriceHistory.effectiveFrom), desc(partnerPriceHistory.createdAt));
  for (const row of rows) {
    const key = `${row.linkId}:${row.variantId}`;
    if (!map.has(key)) map.set(key, { id: row.id, unitCost: row.unitCost, sellPrice: row.sellPrice });
  }
  return map;
}

function partnerTicketNo() {
  return `M-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;
}

/**
 * Buat tiket "Mitra" + baris mitra untuk order yang baru disahkan. Idempoten: order_item yang sudah
 * punya baris mitra dilewati (retry / accept ulang tidak menggandakan tiket maupun kewajiban).
 */
export async function createPartnerTicketsForOrder(
  tx: DbLike,
  input: {
    order: { id: string; orderNo: string; tableLabel: string; customerName: string | null; outletId: string; channel: string };
    lines: Array<{ id: string; menuItemId: string | null; variantId: string; itemName: string; variantLabel: string; qty: number; unitPrice: number; note: string | null }>;
    links: Map<string, PartnerLinkInfo>;
    targetMinutes: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const partnerLines = input.lines.filter((line) => line.menuItemId && input.links.has(line.menuItemId));
  if (!partnerLines.length) return [];
  const existing = await tx
    .select({ orderItemId: partnerOrderLines.orderItemId })
    .from(partnerOrderLines)
    .where(inArray(partnerOrderLines.orderItemId, partnerLines.map((line) => line.id)));
  const done = new Set(existing.map((row) => row.orderItemId));
  const pending = partnerLines.filter((line) => !done.has(line.id));
  if (!pending.length) return [];

  const prices = await currentPrices(tx, [...new Set(pending.map((line) => input.links.get(line.menuItemId!)!.linkId))], now);
  const byPartner = new Map<string, typeof pending>();
  for (const line of pending) {
    const link = input.links.get(line.menuItemId!)!;
    if (!prices.has(`${link.linkId}:${line.variantId}`)) {
      throw new PartnerOrderError(`${line.itemName}: HPP mitra untuk varian ini belum ditetapkan Owner.`);
    }
    byPartner.set(link.partnerId, [...(byPartner.get(link.partnerId) ?? []), line]);
  }

  const created: Array<{ ticketNo: string; partnerId: string }> = [];
  for (const [partnerId, lines] of byPartner) {
    const itemNotes: Record<string, string> = {};
    const labels = lines.map((line) => {
      const label = `${line.qty}x ${line.itemName}${line.variantLabel && line.variantLabel !== "Regular" ? ` (${line.variantLabel})` : ""}`;
      if (line.note?.trim()) itemNotes[label] = line.note.trim();
      return label;
    });
    const [ticket] = await tx
      .insert(kitchenTickets)
      .values({
        ticketNo: partnerTicketNo(),
        orderId: input.order.id,
        tableLabel: input.order.tableLabel,
        channel: input.order.channel,
        station: PARTNER_STATION,
        partnerId,
        status: "queue",
        elapsed: 0,
        priority: "normal",
        targetMinutes: input.targetMinutes,
        targetGroup: "food",
        items: labels,
        itemNotes,
        customerName: input.order.customerName,
        orderNo: input.order.orderNo,
      })
      .returning({ id: kitchenTickets.id, ticketNo: kitchenTickets.ticketNo });
    await tx.insert(productionTicketItems).values(
      lines.map((line) => ({
        ticketId: ticket.id,
        orderId: input.order.id,
        orderItemId: line.id,
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        itemName: line.itemName,
        variantLabel: line.variantLabel,
        qty: line.qty,
        note: line.note?.trim() || null,
        station: PARTNER_STATION,
        partnerId,
        batchEligible: false,
        customerName: input.order.customerName,
        tableLabel: input.order.tableLabel,
        orderNo: input.order.orderNo,
      })),
    );
    await tx
      .insert(partnerOrderLines)
      .values(
        lines.map((line) => {
          const link = input.links.get(line.menuItemId!)!;
          const price = prices.get(`${link.linkId}:${line.variantId}`)!;
          return {
            orderItemId: line.id,
            orderId: input.order.id,
            partnerId,
            outletId: input.order.outletId,
            ticketId: ticket.id,
            menuItemId: line.menuItemId!,
            variantId: line.variantId,
            itemName: line.itemName,
            variantLabel: line.variantLabel,
            qty: line.qty,
            unitPrice: line.unitPrice,
            unitCost: price.unitCost,
            priceHistoryId: price.id,
            tableLabel: input.order.tableLabel,
            customerName: input.order.customerName,
            orderNo: input.order.orderNo,
          };
        }),
      )
      .onConflictDoNothing({ target: partnerOrderLines.orderItemId });
    created.push({ ticketNo: ticket.ticketNo, partnerId });
  }
  if (created.length) schedulePartnerPush(created, input.order);
  return created;
}

/**
 * Refund item mitra yang sudah dipenuhi (dipanggil setelah refund disetujui di modul order).
 * Baris sumber tidak dihapus: penyesuaian negatif, idempoten per sourceRef.
 */
export async function recordPartnerRefundAdjustment(
  db: DbLike,
  input: { orderItemId: string; qty: number; sourceRef: string; reason: string; actorId?: string | null },
) {
  const [line] = await db.select().from(partnerOrderLines).where(eq(partnerOrderLines.orderItemId, input.orderItemId)).limit(1);
  if (!line || input.qty <= 0) return null;
  const qty = Math.min(input.qty, line.qty);
  // Baris yang sudah ditolak/dibatalkan mitra tidak pernah dihitung sebagai penjualan → refund-nya tidak
  // boleh mengurangi penjualan lagi (dobel). Jejak penyesuaian tetap dicatat dengan nilai 0.
  const soldQty = Math.max(0, Math.min(qty, line.qty - line.cancelledQty));
  await db
    .insert(partnerAdjustments)
    .values({
      partnerId: line.partnerId,
      outletId: line.outletId,
      orderLineId: line.id,
      kind: "refund",
      qty: -qty,
      salesDelta: -soldQty * line.unitPrice,
      // DEC-04/05: barang yang sudah dibuat & diserahkan tetap dibayar ke mitra kecuali Owner memutuskan lain
      // (penyesuaian kewajiban terpisah). Refund default hanya mengurangi penjualan.
      liabilityDelta: 0,
      reason: input.reason,
      status: "approved",
      sourceRef: input.sourceRef,
      createdBy: input.actorId ?? null,
    })
    .onConflictDoNothing({ target: partnerAdjustments.sourceRef });
  return { partnerId: line.partnerId };
}


/**
 * Push "pesanan baru" ke HP mitra. Dijadwalkan sesaat setelah transaksi (bukan di dalamnya) dan hanya dikirim
 * bila tiketnya benar-benar tersimpan — order yang gagal/rollback tidak memicu push. Gagal kirim diabaikan.
 */
function schedulePartnerPush(tickets: Array<{ ticketNo: string; partnerId: string }>, order: { orderNo: string; tableLabel: string | null }) {
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const db = getDb();
        const saved = await db
          .select({ ticketNo: kitchenTickets.ticketNo, partnerId: kitchenTickets.partnerId })
          .from(kitchenTickets)
          .where(inArray(kitchenTickets.ticketNo, tickets.map((ticket) => ticket.ticketNo)));
        if (!saved.length) return;
        const { sendPartnerPush } = await import("@/lib/web-push-sender");
        for (const ticket of saved) {
          if (!ticket.partnerId) continue;
          await sendPartnerPush(ticket.partnerId, {
            title: "Pesanan baru Garage Coffee",
            body: `${order.orderNo} · ${order.tableLabel ?? "Take away"} — buka Portal Mitra untuk menerima.`,
            url: "/partner",
            tag: `partner-ticket:${ticket.ticketNo}`,
            requireInteraction: true,
          });
        }
      } catch {
        /* push hanya pelengkap: portal tetap menampilkan pesanan lewat polling */
      }
    })();
  }, 1500);
  timer.unref?.();
}

/**
 * Order dibatalkan Garage (void / batal item) setelah tiket masuk ke mitra → mitra diberi tahu supaya berhenti membuat.
 * Dipanggil dari dalam transaksi pembatalan; push + catatan event dikirim sesaat setelahnya dan hanya bila tiketnya
 * benar-benar berstatus cancelled (transaksi yang rollback tidak memicu apa pun). Tiket non-mitra diabaikan.
 */
export function schedulePartnerCancelNotice(ticketNos: string[]) {
  if (!ticketNos.length) return;
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const db = getDb();
        const rows = await db
          .select({ ticketNo: kitchenTickets.ticketNo, partnerId: kitchenTickets.partnerId, orderNo: kitchenTickets.orderNo, tableLabel: kitchenTickets.tableLabel, status: kitchenTickets.status, reason: kitchenTickets.issueReason })
          .from(kitchenTickets)
          .where(inArray(kitchenTickets.ticketNo, ticketNos));
        const cancelled = rows.filter((row) => row.partnerId && row.status === "cancelled");
        if (!cancelled.length) return;
        const { sendPartnerPush } = await import("@/lib/web-push-sender");
        for (const row of cancelled) {
          await db.insert(partnerEvents).values({
            partnerId: row.partnerId!,
            kind: "ticket_cancelled_by_garage",
            subjectId: row.ticketNo,
            toStatus: "cancelled",
            reason: row.reason ?? null,
            actorType: "system",
            actorName: "Garage OS",
          });
          await sendPartnerPush(row.partnerId!, {
            title: "Pesanan DIBATALKAN Garage Coffee",
            body: `${row.orderNo ?? row.ticketNo} · ${row.tableLabel ?? "Take away"} — jangan dibuat.`,
            url: "/partner",
            tag: `partner-ticket:${row.ticketNo}`,
            requireInteraction: true,
          }).catch(() => undefined);
        }
      } catch {
        /* pemberitahuan pelengkap: portal tetap menampilkan kartu "Dibatalkan Garage" lewat polling */
      }
    })();
  }, 1500);
  timer.unref?.();
}

/**
 * Pisah bill: baris mitra mengikuti item-nya ke bill pisahan.
 * - Seluruh qty pindah → baris mitra pindah order (order_id / order_no).
 * - Sebagian qty pindah → baris mitra dibagi dua (snapshot harga/HPP & tiket sama; qty siap/batal ikut terbagi).
 * Bukan produk mitra → tidak melakukan apa-apa.
 */
export async function movePartnerLineOnSplit(
  db: DbLike,
  input: { orderItemId: string; child: { id: string; orderNo: string }; movedQty?: number; newOrderItemId?: string },
) {
  const [line] = await db.select().from(partnerOrderLines).where(eq(partnerOrderLines.orderItemId, input.orderItemId)).limit(1);
  if (!line) return;
  const now = new Date();
  if (input.movedQty === undefined || !input.newOrderItemId || input.movedQty >= line.qty) {
    await db.update(partnerOrderLines).set({ orderId: input.child.id, orderNo: input.child.orderNo, updatedAt: now }).where(eq(partnerOrderLines.id, line.id));
    return;
  }
  const moved = input.movedQty;
  const keep = line.qty - moved;
  // Bagian yang pindah mengambil qty siap/batal lebih dulu sebanyak yang ada; sisanya tetap di bill asal.
  const movedFulfilled = Math.min(moved, line.fulfilledQty);
  const movedCancelled = Math.min(moved, line.cancelledQty);
  await db
    .update(partnerOrderLines)
    .set({ qty: keep, fulfilledQty: Math.min(keep, line.fulfilledQty - movedFulfilled), cancelledQty: Math.min(keep, line.cancelledQty - movedCancelled), updatedAt: now })
    .where(eq(partnerOrderLines.id, line.id));
  const { id: _id, ...rest } = line;
  await db.insert(partnerOrderLines).values({
    ...rest,
    orderItemId: input.newOrderItemId,
    orderId: input.child.id,
    orderNo: input.child.orderNo,
    qty: moved,
    fulfilledQty: movedFulfilled,
    cancelledQty: movedCancelled,
    updatedAt: now,
  });
}
