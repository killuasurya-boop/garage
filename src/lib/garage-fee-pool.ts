// Payroll V2 — pool fee harian & split proporsional jam kerja.
//
// Prinsip:
// - Setiap POS order "paid" → akumulasi ke `fee_pool_daily` sebesar
//   `feePerProduct × Σ qty (exclude promo bila settings.excludePromo)`.
// - Akhir hari (cron 23:59): pool dibagi proporsional jam kerja ke staff yang:
//     * absensi status = 'valid'
//     * role BUKAN manajer (via `feePool.excludeRoles` di settings)
//     * jam kerja ≥ `feePool.minMinutes`
// - Fee credit dicatat di `staffEarnings` (walletType=... eksisting; kita pakai
//   itemKind='fee_pool' sebagai penanda) + rincian ke `fee_pool_splits`.

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  feePoolDaily,
  feePoolSplits,
  orderItems,
  staffAttendanceV2,
  staffEarnings,
  staffProfiles,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import {
  PAYROLL_KEYS,
  getPayrollSetting,
  isPayrollV2Enabled,
} from "@/lib/garage-payroll-settings";

export interface FeePoolOrderItem {
  qty: number;
  unitPrice: number;
  itemName?: string;
}

/** Akumulasi fee ke pool harian dari orderId (fetch orderItems sendiri). */
export async function accumulateFeePoolFromOrder(
  orderId: string,
  now: Date = new Date(),
): Promise<{ added: number; productCount: number; skipped?: string }> {
  if (!isPayrollV2Enabled()) return { added: 0, productCount: 0, skipped: "v2_disabled" };

  const settings = (await getPayrollSetting(PAYROLL_KEYS.feePool)) as {
    enabled: boolean;
    perProduct: number;
    excludePromo: boolean;
  };
  if (!settings.enabled) return { added: 0, productCount: 0, skipped: "feepool_disabled" };

  const db = getDb();
  const items = await db
    .select({ qty: orderItems.qty, unitPrice: orderItems.unitPrice })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  let productCount = 0;
  for (const it of items) {
    if (settings.excludePromo && (it.unitPrice ?? 0) <= 0) continue;
    productCount += it.qty ?? 0;
  }
  if (productCount === 0) return { added: 0, productCount: 0, skipped: "no_items" };

  const added = settings.perProduct * productCount;
  const dateKey = jakartaDateKey(now);

  await db
    .insert(feePoolDaily)
    .values({
      date: dateKey,
      poolAmount: added,
      productCount,
      feePerProduct: settings.perProduct,
    })
    .onConflictDoUpdate({
      target: feePoolDaily.date,
      set: {
        poolAmount: sql`${feePoolDaily.poolAmount} + ${added}`,
        productCount: sql`${feePoolDaily.productCount} + ${productCount}`,
        updatedAt: now,
      },
    });

  return { added, productCount };
}

/** Split pool ke staff hadir valid non-manajer. Idempoten via `feePoolDaily.finalizedAt`. */
export async function splitFeePoolForDay(
  dateKey: string,
  now: Date = new Date(),
): Promise<{
  finalized: boolean;
  skipped?: string;
  pool: number;
  totalMinutes: number;
  splits: Array<{ staffUserId: string; amount: number; minutes: number }>;
}> {
  const db = getDb();

  // Idempoten: kalau pool sudah finalized, skip.
  const [pool] = await db
    .select()
    .from(feePoolDaily)
    .where(eq(feePoolDaily.date, dateKey))
    .limit(1);
  if (!pool) {
    return { finalized: false, skipped: "no_pool_row", pool: 0, totalMinutes: 0, splits: [] };
  }
  if (pool.finalizedAt) {
    return { finalized: true, skipped: "already_finalized", pool: pool.poolAmount, totalMinutes: pool.totalMinutesValid, splits: [] };
  }

  const settings = (await getPayrollSetting(PAYROLL_KEYS.feePool)) as {
    splitMode: "proportional_hours" | "equal";
    fallbackMode: "hangus" | "kas";
    minMinutes: number;
    excludeRoles: string[];
  };

  // Ambil semua staff valid hari itu + role-nya.
  const rows = await db
    .select({
      staffUserId: staffAttendanceV2.staffUserId,
      workedMinutes: staffAttendanceV2.workedMinutes,
      role: staffProfiles.role,
    })
    .from(staffAttendanceV2)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffAttendanceV2.staffUserId))
    .where(
      and(
        eq(staffAttendanceV2.date, dateKey),
        eq(staffAttendanceV2.status, "valid"),
      ),
    );

  const eligible = rows.filter(
    (r) =>
      !(settings.excludeRoles ?? []).includes(r.role ?? "") &&
      (r.workedMinutes ?? 0) >= settings.minMinutes,
  );

  const totalMinutes = eligible.reduce((s, r) => s + (r.workedMinutes ?? 0), 0);
  const splits: Array<{ staffUserId: string; amount: number; minutes: number }> = [];

  if (eligible.length === 0 || totalMinutes === 0) {
    // Fallback: hangus atau masuk kas — di sini kita hanya tandai finalized tanpa split.
    await db
      .update(feePoolDaily)
      .set({
        finalizedAt: now,
        totalStaffValid: 0,
        totalMinutesValid: 0,
        notes: `fallback=${settings.fallbackMode}`,
        updatedAt: now,
      })
      .where(eq(feePoolDaily.date, dateKey));
    return {
      finalized: true,
      pool: pool.poolAmount,
      totalMinutes: 0,
      splits: [],
      skipped: `fallback_${settings.fallbackMode}`,
    };
  }

  // Hitung split
  let allocated = 0;
  for (let i = 0; i < eligible.length; i++) {
    const r = eligible[i];
    let amount: number;
    if (settings.splitMode === "equal") {
      amount = Math.floor(pool.poolAmount / eligible.length);
    } else {
      amount = Math.floor((pool.poolAmount * (r.workedMinutes ?? 0)) / totalMinutes);
    }
    // Rounding: sisa terakhir dapat ke staff terakhir supaya total match pool
    if (i === eligible.length - 1) amount = pool.poolAmount - allocated;
    allocated += amount;

    splits.push({ staffUserId: r.staffUserId, amount, minutes: r.workedMinutes ?? 0 });
  }

  // Bungkus dalam transaction: insert splits + earnings, update pool.
  await db.transaction(async (tx) => {
    for (const s of splits) {
      const [earning] = await tx
        .insert(staffEarnings)
        .values({
          staffUserId: s.staffUserId,
          outletId: null,
          ticketId: null,
          orderId: null,
          orderItemId: null,
          itemKind: "fee_pool",
          role: null,
          event: "fee_pool_split",
          qty: 1,
          unitFee: s.amount,
          amount: s.amount,
          status: "accrued",
          cycleStart: new Date(`${dateKey}T00:00:00+07:00`),
          cycleEnd: new Date(`${dateKey}T23:59:59+07:00`),
        })
        .returning({ id: staffEarnings.id });

      await tx.insert(feePoolSplits).values({
        date: dateKey,
        staffUserId: s.staffUserId,
        minutesWorked: s.minutes,
        sharePct: totalMinutes ? (s.minutes / totalMinutes) * 100 : 0,
        amount: s.amount,
        earningId: earning.id,
      });
    }
    await tx
      .update(feePoolDaily)
      .set({
        finalizedAt: now,
        totalStaffValid: eligible.length,
        totalMinutesValid: totalMinutes,
        splitMode: settings.splitMode,
        fallbackMode: settings.fallbackMode,
        updatedAt: now,
      })
      .where(eq(feePoolDaily.date, dateKey));
  });

  return { finalized: true, pool: pool.poolAmount, totalMinutes, splits };
}

/** Ambil ringkasan pool + rincian split tanggal tertentu (untuk transparansi UI). */
export async function getFeePoolDetail(dateKey: string) {
  const db = getDb();
  const [pool] = await db
    .select()
    .from(feePoolDaily)
    .where(eq(feePoolDaily.date, dateKey))
    .limit(1);
  const splits = await db
    .select()
    .from(feePoolSplits)
    .where(eq(feePoolSplits.date, dateKey));
  return { pool: pool ?? null, splits };
}

/**
 * Ringkasan wallet fee staff: saldo (agregat SQL dari SEMUA split) + histori
 * terbaru (dibatasi supaya query cepat walau data bertahun-tahun).
 */
export async function getFeeWalletSummary(staffUserId: string, limit = 60) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 366);
  const [[agg], entries] = await Promise.all([
    db
      .select({
        balance: sql<number>`COALESCE(SUM(${feePoolSplits.amount} + ${feePoolSplits.bonusTarget} + ${feePoolSplits.bonusZeroKomplain}), 0)`,
      })
      .from(feePoolSplits)
      .where(eq(feePoolSplits.staffUserId, staffUserId)),
    db
      .select()
      .from(feePoolSplits)
      .where(eq(feePoolSplits.staffUserId, staffUserId))
      .orderBy(sql`${feePoolSplits.date} DESC`)
      .limit(safeLimit),
  ]);
  return { balance: Number(agg?.balance ?? 0), entries };
}
