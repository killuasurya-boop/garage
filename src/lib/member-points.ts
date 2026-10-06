import { and, eq, gt, gte, lt, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { customers, memberTransactions, pointRedemptions } from "@/db/schema";
import type { AppSettings } from "@/lib/garage-app-settings-types";
import { maxRedeemablePoints } from "@/lib/member-types";

// =============================================================================
// Pakai poin member saat bayar (owner, Okt 2026). Potongan poin masuk ke
// orders.discount (mengurangi omzet bersih) dan tercatat di point_redemptions
// dengan orderId, supaya void / refund / tolak order mengembalikan poinnya.
// Saldo dipotong atomik (points >= n) → tidak bisa dipakai dobel bersamaan.
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PointsSettings = Pick<
  AppSettings,
  "memberPointValue" | "memberRedeemMaxPct" | "memberRedeemMinPoints"
>;

/** Validasi permintaan poin terhadap batas tagihan (saldo dicek atomik saat potong). */
export function pointsDiscountFor(input: {
  requested: number | null | undefined;
  /** Harga menu setelah promo/voucher/diskon lain (tanpa pajak/service/ongkir). */
  base: number;
  /** Saldo poin terbaca (pra-cek; potong final tetap atomik). */
  balance: number;
  settings: PointsSettings;
}): { points: number; discount: number } {
  const requested = Math.floor(Number(input.requested ?? 0));
  if (!requested || requested <= 0) return { points: 0, discount: 0 };
  if (input.settings.memberRedeemMaxPct <= 0) throw new Error("Pakai poin sedang dimatikan di Pengaturan.");
  if (requested < input.settings.memberRedeemMinPoints) {
    throw new Error(`Minimal pakai ${input.settings.memberRedeemMinPoints} poin.`);
  }
  if (requested > input.balance) throw new Error(`Saldo poin tidak cukup (sisa ${input.balance} poin).`);
  const max = maxRedeemablePoints({
    balance: input.balance,
    base: input.base,
    pointValue: input.settings.memberPointValue,
    maxPct: input.settings.memberRedeemMaxPct,
  });
  if (requested > max) {
    throw new Error(`Maksimal ${max} poin untuk tagihan ini (${input.settings.memberRedeemMaxPct}% dari harga menu).`);
  }
  return { points: requested, discount: requested * input.settings.memberPointValue };
}

/** Potong saldo poin secara atomik + catat redemption terikat order. */
export async function redeemPointsForOrder(
  tx: Tx | Db,
  input: { customerId: string; orderId: string; points: number; discount: number; source: "POS" | "QR" },
) {
  if (input.points <= 0) return null;
  const [updated] = await tx
    .update(customers)
    .set({ points: sql`${customers.points} - ${input.points}`, updatedAt: new Date() })
    .where(and(eq(customers.id, input.customerId), gte(customers.points, input.points)))
    .returning({ points: customers.points });
  if (!updated) throw new Error("Saldo poin tidak cukup — mungkin baru dipakai di transaksi lain.");
  await tx.insert(pointRedemptions).values({
    customerId: input.customerId,
    orderId: input.orderId,
    pointsUsed: input.points,
    discount: input.discount,
    source: input.source,
    status: "redeemed",
  });
  return { balance: updated.points };
}

/**
 * Kembalikan poin yang dipakai di order (void/tolak = semua, refund = proporsional).
 * Aman dipanggil berulang: hanya sisa yang belum dikembalikan.
 */
export async function returnPointsForOrder(tx: Tx | Db, orderId: string, input: { ratio: number }) {
  const rows = await tx.select().from(pointRedemptions).where(eq(pointRedemptions.orderId, orderId));
  let returned = 0;
  for (const row of rows) {
    const remaining = row.pointsUsed - row.returnedPoints;
    if (remaining <= 0) continue;
    const target = input.ratio >= 1 ? remaining : Math.min(remaining, Math.round(row.pointsUsed * input.ratio));
    if (target <= 0) continue;
    await tx
      .update(customers)
      .set({ points: sql`${customers.points} + ${target}`, updatedAt: new Date() })
      .where(eq(customers.id, row.customerId));
    const fully = row.returnedPoints + target >= row.pointsUsed;
    await tx
      .update(pointRedemptions)
      .set({
        returnedPoints: row.returnedPoints + target,
        status: fully ? "returned" : "redeemed",
        returnedAt: new Date(),
      })
      .where(eq(pointRedemptions.id, row.id));
    returned += target;
  }
  return returned;
}

/** Order ini memakai poin? (dipakai untuk memblokir split bill). */
export async function orderHasPointRedemption(tx: Tx | Db, orderId: string) {
  const [row] = await tx
    .select({ id: pointRedemptions.id })
    .from(pointRedemptions)
    .where(and(eq(pointRedemptions.orderId, orderId), eq(pointRedemptions.status, "redeemed")))
    .limit(1);
  return Boolean(row);
}

/**
 * Poin hangus bila member tidak aktif N bulan (owner, Okt 2026): tidak ada
 * pesanan lunas, poin masuk, atau pemakaian poin sejak batas waktu. Dicatat
 * sebagai member_transactions "EXPIRE" (negatif, tanpa orderId).
 */
export async function expireInactivePoints(db: Db, input: { months: number; now?: Date }) {
  if (!input.months || input.months <= 0) return [] as Array<{ customerId: string; points: number }>;
  const cutoff = new Date(input.now ?? new Date());
  cutoff.setMonth(cutoff.getMonth() - input.months);
  const stale = await db
    .select({ id: customers.id, points: customers.points, tier: customers.cardTier })
    .from(customers)
    .where(
      and(
        gt(customers.points, 0),
        lt(customers.createdAt, cutoff),
        sql`not exists (select 1 from "member_transactions" mt where mt.customer_id = "customers"."id" and mt.created_at >= ${cutoff} and mt.points_earned > 0)`,
        sql`not exists (select 1 from "orders" o where o.customer_id = "customers"."id" and o.status = 'paid' and o.created_at >= ${cutoff})`,
        sql`not exists (select 1 from "point_redemptions" pr where pr.customer_id = "customers"."id" and pr.created_at >= ${cutoff})`,
      ),
    );
  const expired: Array<{ customerId: string; points: number }> = [];
  for (const row of stale) {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(customers)
        .set({ points: sql`${customers.points} - ${row.points}`, updatedAt: new Date() })
        .where(and(eq(customers.id, row.id), gte(customers.points, row.points)))
        .returning({ id: customers.id });
      if (!updated) return;
      await tx.insert(memberTransactions).values({
        customerId: row.id,
        source: "EXPIRE",
        orderId: null,
        amount: 0,
        pointsEarned: -row.points,
        levelBefore: row.tier,
        levelAfter: row.tier,
      });
      expired.push({ customerId: row.id, points: row.points });
    });
  }
  return expired;
}

/** Nilai poin beredar (kewajiban ke member) = saldo semua member × nilai poin. */
export async function outstandingPointsValue(db: Db, pointValue: number) {
  const [row] = await db
    .select({ points: sql<string>`coalesce(sum(${customers.points}), 0)::bigint` })
    .from(customers)
    .where(gt(customers.points, 0));
  const points = Number(row?.points ?? 0);
  return { points, value: points * pointValue };
}
