// =============================================================================
// Production Hub V4 — Riwayat produksi (drawer di layar produksi, tanpa pindah
// halaman). Read-only dari kitchen_tickets + production_ticket_items +
// print_jobs; koreksi tetap lewat aksi tiket yang sudah ada (reopen bertanda
// alasan, dicek izin station di server).
// =============================================================================

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { kitchenTickets, orders, productionTicketItems, user } from "@/db/schema";
import { normalizeProductionStation, productionItemLabel } from "@/lib/garage-production-rules";
import { completionPrintsForOrders } from "@/lib/production-completion-print";
import type { CompletionPrintView } from "@/lib/production-completion-print-rules";
import type { GarageSession } from "@/lib/server-auth";

export type HistoryStatusFilter = "all" | "active" | "ready" | "delivered" | "cancelled";

export type ProductionHistoryTicket = {
  ticketNo: string;
  station: "Bar" | "Food";
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  readyAt: string | null;
  readyByName: string | null;
  handoverAt: string | null;
  handoverByName: string | null;
  deliveredAt: string | null;
  deliveredByName: string | null;
  claimedByName: string | null;
  issueReason: string | null;
  targetMinutes: number;
  chitPrintedAt: string | null;
  items: Array<{ label: string; qty: number; note: string | null; status: string }>;
};

export type ProductionHistoryOrder = {
  key: string;
  orderId: string | null;
  orderNo: string | null;
  table: string;
  channel: string;
  customerName: string | null;
  createdAt: string;
  /** Kasir yang menerima order (orders.accepted_by). */
  cashierName: string | null;
  customerNote: string | null;
  orderSource: string | null;
  acceptedAt: string | null;
  tickets: ProductionHistoryTicket[];
  prints: CompletionPrintView[];
};

function jakartaRange(date?: string | null) {
  const key =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
  const start = new Date(`${key}T00:00:00+07:00`);
  return { key, start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

const STATUS_SETS: Record<HistoryStatusFilter, string[] | null> = {
  all: null,
  active: ["queue", "cooking"],
  ready: ["ready"],
  delivered: ["delivered"],
  cancelled: ["cancelled", "canceled", "rejected"],
};

export async function getProductionHistory(
  garage: GarageSession,
  params: {
    q?: string | null;
    date?: string | null;
    status?: HistoryStatusFilter | null;
    limit?: number;
    /** Popup detail: satu order persis (tanpa batas tanggal, tetap dibatasi outlet). */
    orderId?: string | null;
  },
) {
  const db = getDb();
  const { key, start, end } = jakartaRange(params.date);
  const byOrder = params.orderId ?? null;
  const statuses = STATUS_SETS[params.status ?? "all"] ?? null;
  const q = params.q?.trim().slice(0, 40) ?? "";
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const tableQ = /^\d{1,2}$/.test(q) ? `%${q.padStart(2, "0")}%` : null;

  const ticketRows = await db
    .select()
    .from(kitchenTickets)
    .where(
      and(
        byOrder ? eq(kitchenTickets.orderId, byOrder) : gte(kitchenTickets.createdAt, start),
        byOrder ? undefined : lt(kitchenTickets.createdAt, end),
        or(
          isNull(kitchenTickets.orderId),
          inArray(
            kitchenTickets.orderId,
            db.select({ id: orders.id }).from(orders).where(eq(orders.outletId, garage.profile.outlet.id)),
          ),
        ),
        statuses ? inArray(kitchenTickets.status, statuses) : undefined,
        like
          ? or(
              ilike(kitchenTickets.orderNo, like),
              ilike(kitchenTickets.ticketNo, like),
              ilike(kitchenTickets.tableLabel, tableQ ?? like),
              ilike(kitchenTickets.customerName, like),
            )
          : undefined,
      ),
    )
    .orderBy(desc(kitchenTickets.createdAt))
    .limit(Math.min(Math.max(params.limit ?? 120, 1), 300));

  const ids = ticketRows.map((row) => row.id);
  const itemRows = ids.length
    ? await db
        .select()
        .from(productionTicketItems)
        .where(inArray(productionTicketItems.ticketId, ids))
        .orderBy(asc(productionTicketItems.createdAt))
    : [];
  const orderIds = [...new Set(ticketRows.map((row) => row.orderId).filter((id): id is string => Boolean(id)))];
  const prints = await completionPrintsForOrders(orderIds);
  // Info order untuk popup detail: kasir penerima, catatan pelanggan, sumber order.
  const orderMeta = orderIds.length
    ? await db
        .select({
          id: orders.id,
          // Kasir = yang menerima order (QR/waiter); order POS langsung = pembuatnya.
          cashierName: user.name,
          customerNote: orders.customerNote,
          orderSource: orders.orderSource,
          acceptedAt: orders.acceptedAt,
        })
        .from(orders)
        .leftJoin(user, eq(user.id, sql`coalesce(${orders.acceptedBy}, ${orders.createdBy})`))
        .where(inArray(orders.id, orderIds))
    : [];
  const metaById = new Map(orderMeta.map((m) => [m.id, m]));

  const byKey = new Map<string, ProductionHistoryOrder>();
  for (const row of ticketRows) {
    const k = row.orderId ?? `ticket:${row.ticketNo}`;
    const group =
      byKey.get(k) ??
      ({
        key: k,
        orderId: row.orderId,
        orderNo: row.orderNo,
        table: row.tableLabel,
        channel: row.channel,
        customerName: row.customerName,
        createdAt: row.createdAt.toISOString(),
        cashierName: (row.orderId && metaById.get(row.orderId)?.cashierName) || null,
        customerNote: (row.orderId && metaById.get(row.orderId)?.customerNote) || null,
        orderSource: (row.orderId && metaById.get(row.orderId)?.orderSource) || null,
        acceptedAt: (row.orderId && metaById.get(row.orderId)?.acceptedAt?.toISOString()) || null,
        tickets: [],
        prints: prints.filter((p) => row.orderId && p.orderId === row.orderId),
      } satisfies ProductionHistoryOrder);
    if (row.createdAt.toISOString() < group.createdAt) group.createdAt = row.createdAt.toISOString();
    const own = itemRows.filter((item) => item.ticketId === row.id);
    group.tickets.push({
      ticketNo: row.ticketNo,
      station: normalizeProductionStation(row.station),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      acceptedByName: row.acceptedByName ?? null,
      readyAt: row.readyAt?.toISOString() ?? null,
      readyByName: row.readyByName ?? null,
      handoverAt: row.handoverAt?.toISOString() ?? null,
      handoverByName: row.handoverByName ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      deliveredByName: row.deliveredByName ?? null,
      claimedByName: row.claimedByName ?? null,
      issueReason: row.issueReason ?? null,
      targetMinutes: row.targetMinutes,
      chitPrintedAt: row.chitPrintedAt?.toISOString() ?? null,
      items: own.length
        ? own.map((item) => ({
            label: productionItemLabel(item.itemName, item.variantLabel),
            qty: item.qty,
            note: item.note,
            status: item.status,
          }))
        : row.items.map((raw) => {
            const match = raw.match(/^\s*(\d+)\s*x\s+(.*)$/i);
            return {
              label: match ? match[2].trim() : raw.trim(),
              qty: match ? Number(match[1]) || 1 : 1,
              note: null,
              status: row.status,
            };
          }),
    });
    byKey.set(k, group);
  }

  return {
    date: key,
    orders: [...byKey.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
