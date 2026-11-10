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
  partnerOrderLines,
  partnerPriceHistory,
  partnerProductLinks,
  partners,
  productionTicketItems,
} from "@/db/schema";
import { PARTNER_STATION, partnerOrderBlockReason } from "@/lib/partner-hub-rules";

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
export async function loadPartnerLinks(db: DbLike, menuItemIds: string[]) {
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
      operationalStatus: partner.operationalStatus,
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
  options: { hubEnabled: boolean; outletId: string; customerSelfOrder?: boolean; now?: Date },
) {
  for (const line of lines) {
    const link = links.get(line.itemId);
    if (!link && line.productType !== "partner") continue;
    if (options.customerSelfOrder) {
      // DEC-14: produk mitra hanya dipesan lewat waiter/kasir (menu digital = lihat saja).
      throw new PartnerOrderError(`${line.itemName} adalah produk mitra — pesan lewat waiter atau kasir.`);
    }
    if (!link) throw new PartnerOrderError(`${line.itemName} belum terhubung ke mitra resmi.`);
    if (link.outletId !== options.outletId) throw new PartnerOrderError(`${line.itemName} bukan produk mitra outlet ini.`);
    const reason = partnerOrderBlockReason(
      {
        hubEnabled: options.hubEnabled,
        partnerStatus: link.partnerStatus,
        operationalStatus: link.operationalStatus,
        linkActive: link.linkActive,
        productStock: line.stock,
        lastOrderByDay: link.lastOrderByDay,
      },
      options.now,
    );
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
  await db
    .insert(partnerAdjustments)
    .values({
      partnerId: line.partnerId,
      outletId: line.outletId,
      orderLineId: line.id,
      kind: "refund",
      qty: -qty,
      salesDelta: -qty * line.unitPrice,
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

