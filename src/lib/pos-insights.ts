// =============================================================================
// Insight POS dari penjualan NYATA (Fase 5, owner 25 Nov 2026).
// - Terlaris 7 hari per outlet (ganti tag manual "Bestseller").
// - "Sering dibeli bersama" per item (pasangan dalam order yang sama).
// Hanya order `paid` outlet itu; baris komponen Paket Event diabaikan (harga paket final, bukan pilihan item).
// Ambang minimum supaya label tidak muncul dari 1–2 kebetulan. Tanpa data = daftar kosong (tidak mengarang).
// =============================================================================

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";

export const BESTSELLER_WINDOW_DAYS = 7;
export const BESTSELLER_LIMIT = 8;
export const BESTSELLER_MIN_QTY = 3;
export const PAIRING_WINDOW_DAYS = 30;
export const PAIRING_MIN_ORDERS = 3;

export type BestsellerRow = { menuItemId: string; qty: number; orders: number };
export type PairingSuggestion = { menuItemId: string; itemName: string; pairCount: number };

/** Urutkan & saring hasil agregasi terlaris (murni, dites tanpa DB). */
export function rankBestsellers(
  rows: readonly { menuItemId: string | null; qty: number; orders: number }[],
  options: { limit?: number; minQty?: number } = {},
): BestsellerRow[] {
  const limit = options.limit ?? BESTSELLER_LIMIT;
  const minQty = options.minQty ?? BESTSELLER_MIN_QTY;
  return rows
    .filter((row): row is BestsellerRow => Boolean(row.menuItemId) && Number(row.qty) >= minQty)
    .map((row) => ({ menuItemId: row.menuItemId, qty: Number(row.qty), orders: Number(row.orders) }))
    .sort((a, b) => b.qty - a.qty || b.orders - a.orders || a.menuItemId.localeCompare(b.menuItemId))
    .slice(0, limit);
}

/** Saring saran pasangan (murni): ambang order, bukan item jangkar, maks `limit`. */
export function rankPairings(
  rows: readonly { menuItemId: string | null; itemName: string; pairCount: number }[],
  anchorId: string,
  options: { limit?: number; minOrders?: number } = {},
): PairingSuggestion[] {
  const limit = options.limit ?? 6;
  const minOrders = options.minOrders ?? PAIRING_MIN_ORDERS;
  const byItem = new Map<string, PairingSuggestion>();
  for (const row of rows) {
    if (!row.menuItemId || row.menuItemId === anchorId) continue;
    const count = Number(row.pairCount);
    const current = byItem.get(row.menuItemId);
    // Satu item bisa muncul dengan beberapa nama (varian/rename) → ambil hitungan terbesar.
    if (!current || count > current.pairCount) byItem.set(row.menuItemId, { menuItemId: row.menuItemId, itemName: row.itemName, pairCount: count });
  }
  return [...byItem.values()]
    .filter((row) => row.pairCount >= minOrders)
    .sort((a, b) => b.pairCount - a.pairCount || a.itemName.localeCompare(b.itemName))
    .slice(0, limit);
}

const notPackageLine = sql`coalesce(${orderItems.eventSnapshot}->>'kind', '') <> 'bundle'`;

function windowStart(days: number, now = Date.now()) {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

export async function getPosBestsellers(params: { outletId: string; days?: number; limit?: number }) {
  const days = Math.max(1, Math.min(90, params.days ?? BESTSELLER_WINDOW_DAYS));
  const rows = await getDb()
    .select({
      menuItemId: orderItems.menuItemId,
      qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)::int`,
      orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.outletId, params.outletId),
        eq(orders.status, "paid"),
        gte(orders.createdAt, windowStart(days)),
        isNotNull(orderItems.menuItemId),
        notPackageLine,
      ),
    )
    .groupBy(orderItems.menuItemId)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .limit(50);
  return {
    windowDays: days,
    bestsellers: rankBestsellers(rows, { limit: params.limit }),
    generatedAt: new Date().toISOString(),
  };
}

export async function getPosPairings(params: { outletId: string; menuItemId: string; days?: number; limit?: number }) {
  const days = Math.max(7, Math.min(180, params.days ?? PAIRING_WINDOW_DAYS));
  const limit = Math.max(1, Math.min(10, params.limit ?? 6));
  const db = getDb();
  const anchorRows = await db
    .selectDistinct({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.outletId, params.outletId),
        eq(orders.status, "paid"),
        gte(orders.createdAt, windowStart(days)),
        eq(orderItems.menuItemId, params.menuItemId),
        notPackageLine,
      ),
    )
    .limit(2000);
  const anchorOrders = anchorRows.length;
  if (!anchorOrders) return { menuItemId: params.menuItemId, windowDays: days, anchorOrders, suggestions: [] as PairingSuggestion[] };

  const pairRows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      itemName: orderItems.itemName,
      pairCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
    })
    .from(orderItems)
    .where(
      and(
        inArray(
          orderItems.orderId,
          anchorRows.map((row) => row.orderId),
        ),
        isNotNull(orderItems.menuItemId),
        sql`${orderItems.menuItemId} <> ${params.menuItemId}`,
        notPackageLine,
      ),
    )
    .groupBy(orderItems.menuItemId, orderItems.itemName)
    .orderBy(desc(sql`count(distinct ${orderItems.orderId})`))
    .limit(30);

  return {
    menuItemId: params.menuItemId,
    windowDays: days,
    anchorOrders,
    suggestions: rankPairings(pairRows, params.menuItemId, { limit }),
  };
}
