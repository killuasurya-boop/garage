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

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  feePoolDaily,
  feePoolSplits,
  orderItems,
  payments,
  staffAttendanceV2,
  staffEarnings,
  staffProfiles,
  staffWageConfig,
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

/**
 * Kurangi fee karena order di-void / item di-refund. Fee dikurangi dari tanggal
 * order itu DIBAYAR (tanggal akumulasinya). `lines` = item yang di-refund; tanpa
 * `lines` (void) semua item order yang tersisa dihitung.
 * Hari yang sudah dibagi (per_head): bagian tiap karyawan yang BELUM dibayar ikut
 * dikurangi; yang sudah dibayar lewat gajian tidak ditarik (dicatat di notes pool).
 */
export async function reverseFeePoolForOrder(
  orderId: string,
  lines?: Array<{ qty: number; unitPrice: number }>,
  now: Date = new Date(),
): Promise<{ removed: number; productCount: number; date?: string; skipped?: string }> {
  if (!isPayrollV2Enabled()) return { removed: 0, productCount: 0, skipped: "v2_disabled" };
  const settings = (await getPayrollSetting(PAYROLL_KEYS.feePool)) as {
    enabled: boolean;
    perProduct: number;
    excludePromo: boolean;
    splitMode: string;
  };
  if (!settings.enabled) return { removed: 0, productCount: 0, skipped: "feepool_disabled" };

  const db = getDb();
  const [paid] = await db
    .select({ at: sql<Date | string | null>`MIN(${payments.createdAt})` })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  if (!paid?.at) return { removed: 0, productCount: 0, skipped: "never_paid" };
  const dateKey = jakartaDateKey(new Date(paid.at));

  const items =
    lines ??
    (await db
      .select({ qty: orderItems.qty, unitPrice: orderItems.unitPrice })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId)));
  const productCount = items.reduce(
    (s, it) => s + (settings.excludePromo && (it.unitPrice ?? 0) <= 0 ? 0 : (it.qty ?? 0)),
    0,
  );
  if (productCount === 0) return { removed: 0, productCount: 0, date: dateKey, skipped: "no_items" };

  return db.transaction(async (tx) => {
    const [pool] = await tx.select().from(feePoolDaily).where(eq(feePoolDaily.date, dateKey)).limit(1);
    if (!pool) return { removed: 0, productCount, date: dateKey, skipped: "no_pool_row" };
    const perProduct = pool.feePerProduct || settings.perProduct;
    const removed = Math.min(pool.poolAmount, perProduct * productCount);
    let note = pool.notes ?? "";

    if (pool.finalizedAt && removed > 0) {
      if (pool.splitMode === "per_head" || settings.splitMode === "per_head") {
        const splits = await tx.select().from(feePoolSplits).where(eq(feePoolSplits.date, dateKey));
        let paidOut = 0;
        for (const s of splits) {
          if (s.paymentId) {
            paidOut += 1;
            continue;
          }
          const next = Math.max(0, s.amount - removed);
          await tx.update(feePoolSplits).set({ amount: next }).where(eq(feePoolSplits.id, s.id));
          if (s.earningId) {
            await tx
              .update(staffEarnings)
              .set({ amount: next, unitFee: next })
              .where(and(eq(staffEarnings.id, s.earningId), eq(staffEarnings.status, "accrued")));
          }
        }
        if (paidOut > 0) {
          note = `${note ? `${note}; ` : ""}koreksi -${removed} (${paidOut} karyawan sudah dibayar, tidak ditarik)`;
        }
      } else {
        note = `${note ? `${note}; ` : ""}koreksi -${removed} setelah dibagi (mode ${pool.splitMode ?? settings.splitMode})`;
      }
    }

    await tx
      .update(feePoolDaily)
      .set({
        poolAmount: pool.poolAmount - removed,
        productCount: Math.max(0, pool.productCount - productCount),
        notes: note || null,
        updatedAt: now,
      })
      .where(eq(feePoolDaily.date, dateKey));
    return { removed, productCount, date: dateKey };
  });
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
    splitMode: "proportional_hours" | "equal" | "per_head";
    fallbackMode: "hangus" | "kas";
    minMinutes: number;
    excludeRoles: string[];
  };
  const perHead = settings.splitMode === "per_head";

  // Ambil semua staff valid hari itu + role-nya + flag excludeFromFee (per-orang).
  const rows = await db
    .select({
      staffUserId: staffAttendanceV2.staffUserId,
      workedMinutes: staffAttendanceV2.workedMinutes,
      role: staffProfiles.role,
      excludeFromFee: staffWageConfig.excludeFromFee,
    })
    .from(staffAttendanceV2)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffAttendanceV2.staffUserId))
    .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffAttendanceV2.staffUserId))
    .where(
      and(
        eq(staffAttendanceV2.date, dateKey),
        eq(staffAttendanceV2.status, "valid"),
      ),
    );

  const eligible = rows.filter(
    (r) =>
      !(settings.excludeRoles ?? []).includes(r.role ?? "") &&
      r.excludeFromFee !== true &&
      (r.workedMinutes ?? 0) >= settings.minMinutes,
  );

  const totalMinutes = eligible.reduce((s, r) => s + (r.workedMinutes ?? 0), 0);
  const splits: Array<{ staffUserId: string; amount: number; minutes: number; sharePct: number }> = [];

  // per_head tidak butuh totalMinutes>0 (tiap kepala dapat penuh); mode lain butuh.
  if (eligible.length === 0 || (!perHead && totalMinutes === 0)) {
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
    let sharePct: number;
    if (perHead) {
      // Fee per kepala: tiap staff berhak dapat PENUH (perProduct × produk),
      // TIDAK dibagi. poolAmount = perProduct × produk harian. Total biaya =
      // poolAmount × jumlah staff berhak.
      amount = pool.poolAmount;
      sharePct = 100;
    } else if (settings.splitMode === "equal") {
      amount = Math.floor(pool.poolAmount / eligible.length);
      // Rounding: sisa terakhir dapat ke staff terakhir supaya total match pool
      if (i === eligible.length - 1) amount = pool.poolAmount - allocated;
      allocated += amount;
      sharePct = pool.poolAmount ? (amount / pool.poolAmount) * 100 : 0;
    } else {
      amount = Math.floor((pool.poolAmount * (r.workedMinutes ?? 0)) / totalMinutes);
      if (i === eligible.length - 1) amount = pool.poolAmount - allocated;
      allocated += amount;
      sharePct = totalMinutes ? ((r.workedMinutes ?? 0) / totalMinutes) * 100 : 0;
    }

    splits.push({ staffUserId: r.staffUserId, amount, minutes: r.workedMinutes ?? 0, sharePct });
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
        sharePct: s.sharePct,
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

export type FeeReconcileResult =
  | "added"
  | "removed"
  | "unchanged"
  | "not_finalized"
  | "unsupported"
  | "paid";

/**
 * Sesuaikan fee satu karyawan pada hari yang SUDAH difinalisasi (dipakai saat
 * manajer mengoreksi absen). Hanya mode per_head — mode lain membagi pool,
 * sehingga mengubah satu orang akan mengubah bagian orang lain.
 */
export async function reconcileFeeForStaffDay(
  dateKey: string,
  staffUserId: string,
): Promise<FeeReconcileResult> {
  const db = getDb();
  const [pool] = await db.select().from(feePoolDaily).where(eq(feePoolDaily.date, dateKey)).limit(1);
  if (!pool?.finalizedAt) return "not_finalized"; // akan ikut terbagi saat finalisasi
  const settings = (await getPayrollSetting(PAYROLL_KEYS.feePool)) as {
    splitMode: string;
    minMinutes: number;
    excludeRoles: string[];
  };
  if (settings.splitMode !== "per_head") return "unsupported";

  const [att] = await db
    .select({
      status: staffAttendanceV2.status,
      workedMinutes: staffAttendanceV2.workedMinutes,
      role: staffProfiles.role,
      excludeFromFee: staffWageConfig.excludeFromFee,
    })
    .from(staffAttendanceV2)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffAttendanceV2.staffUserId))
    .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffAttendanceV2.staffUserId))
    .where(and(eq(staffAttendanceV2.date, dateKey), eq(staffAttendanceV2.staffUserId, staffUserId)))
    .limit(1);
  const eligible =
    att?.status === "valid" &&
    !(settings.excludeRoles ?? []).includes(att.role ?? "") &&
    att.excludeFromFee !== true &&
    (att.workedMinutes ?? 0) >= settings.minMinutes;

  const [split] = await db
    .select()
    .from(feePoolSplits)
    .where(and(eq(feePoolSplits.date, dateKey), eq(feePoolSplits.staffUserId, staffUserId)))
    .limit(1);

  if (eligible && !split) {
    await db.transaction(async (tx) => {
      const [earning] = await tx
        .insert(staffEarnings)
        .values({
          staffUserId,
          outletId: null,
          ticketId: null,
          orderId: null,
          orderItemId: null,
          itemKind: "fee_pool",
          role: null,
          event: "fee_pool_split",
          qty: 1,
          unitFee: pool.poolAmount,
          amount: pool.poolAmount,
          status: "accrued",
          cycleStart: new Date(`${dateKey}T00:00:00+07:00`),
          cycleEnd: new Date(`${dateKey}T23:59:59+07:00`),
        })
        .returning({ id: staffEarnings.id });
      await tx.insert(feePoolSplits).values({
        date: dateKey,
        staffUserId,
        minutesWorked: att?.workedMinutes ?? 0,
        sharePct: 100,
        amount: pool.poolAmount,
        earningId: earning.id,
      });
      await tx
        .update(feePoolDaily)
        .set({ totalStaffValid: pool.totalStaffValid + 1, updatedAt: new Date() })
        .where(eq(feePoolDaily.date, dateKey));
    });
    return "added";
  }

  if (!eligible && split) {
    const [earning] = split.earningId
      ? await db.select().from(staffEarnings).where(eq(staffEarnings.id, split.earningId)).limit(1)
      : [];
    if (split.paymentId || (earning && (earning.status !== "accrued" || earning.payoutId))) return "paid";
    await db.transaction(async (tx) => {
      await tx.delete(feePoolSplits).where(eq(feePoolSplits.id, split.id));
      if (earning) await tx.delete(staffEarnings).where(eq(staffEarnings.id, earning.id));
      await tx
        .update(feePoolDaily)
        .set({ totalStaffValid: Math.max(0, pool.totalStaffValid - 1), updatedAt: new Date() })
        .where(eq(feePoolDaily.date, dateKey));
    });
    return "removed";
  }

  return "unchanged";
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
      // Saldo = fee yang BELUM dibayar lewat gajian (payment_id kosong).
      .select({
        balance: sql<number>`COALESCE(SUM(${feePoolSplits.amount} + ${feePoolSplits.bonusTarget} + ${feePoolSplits.bonusZeroKomplain}), 0)`,
      })
      .from(feePoolSplits)
      .where(and(eq(feePoolSplits.staffUserId, staffUserId), isNull(feePoolSplits.paymentId))),
    db
      .select()
      .from(feePoolSplits)
      .where(eq(feePoolSplits.staffUserId, staffUserId))
      .orderBy(sql`${feePoolSplits.date} DESC`)
      .limit(safeLimit),
  ]);
  return { balance: Number(agg?.balance ?? 0), entries };
}
