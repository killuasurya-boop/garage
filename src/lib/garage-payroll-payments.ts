// Payroll V2 — gajian & kasbon.
//
// Gajian: bayar semua gaji + fee yang BELUM dibayar s/d tanggal tertentu, dipotong
// kasbon (FIFO; bila kasbon > gaji, sisanya terbawa ke gajian berikutnya). Baris
// gaji/fee ditandai lunas (payout_id / payment_id) sehingga saldo di HP karyawan
// turun dan tidak bisa dibayar dua kali.
//
// Pembatalan: gajian/kasbon bisa dibatalkan manajer (salah input) dan otomatis
// dibatalkan bila pengeluarannya DITOLAK di Approvals — gaji kembali "belum
// dibayar", potongan kasbon dikembalikan persis (advance_allocations).
//
// Finance (tanpa double counting — lihat finance-control.ts):
//   - Kasbon diberikan  → expense "Kasbon"        (non_pnl, kas saja)
//   - Gajian (uang nyata) → SATU expense "Gaji Karyawan" (payroll_payout, kas saja)
//     sebesar uang yang diserahkan (gaji + fee − kasbon). Satu expense per gajian
//     supaya keputusan Approvals berlaku untuk seluruh gajian.
//   Total kas keluar = kasbon + sisa bayar = gaji bruto. P&L gaji tetap dari
//   staff_daily_wages + fee_pool_splits. Expense ≥ batas approval masuk Approvals;
//   kasbon yang masih menunggu Approvals belum dipotong (uang belum diserahkan).

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { getDb, type GarageDb } from "@/db";
import {
  auditLogs,
  feePoolDaily,
  feePoolSplits,
  staffAttendanceV2,
  staffCashAdvances,
  staffDailyWages,
  staffEarnings,
  staffPayrollPayments,
  staffProfiles,
  staffThrPayments,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import { normalizeEmployeeCode } from "@/lib/garage-absen-employees";
import { cancelExpenseInTx, createExpense } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

export type PayMethod = "Cash" | "Transfer";
type Tx = Parameters<Parameters<GarageDb["transaction"]>[0]>[0];
type DbOrTx = GarageDb | Tx;

export class PayrollPaymentError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "NOTHING_TO_PAY"
      | "DATE_INVALID"
      | "AMOUNT_INVALID"
      | "ALREADY_CANCELLED"
      | "ADVANCE_SETTLED"
      | "NOT_ELIGIBLE"
      | "ALREADY_PAID",
    message: string,
  ) {
    super(message);
    this.name = "PayrollPaymentError";
  }
}

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const actorOf = (garage: GarageSession) => garage.user.name || garage.user.email;

/**
 * Kasbon yang boleh dipotong: aktif, dan pengeluarannya sudah tercatat/disetujui
 * (atau pencatatan Finance gagal — uang dianggap sudah diserahkan).
 */
export const deductibleAdvance = sql`(${staffCashAdvances.status} = 'active' AND (${staffCashAdvances.expenseId} IS NULL OR EXISTS (SELECT 1 FROM expenses e WHERE e.id = ${staffCashAdvances.expenseId} AND e.status IN ('recorded', 'approved', 'paid'))))`;
/** Kasbon aktif yang pengeluarannya masih menunggu Approvals. */
const pendingAdvance = sql`(${staffCashAdvances.status} = 'active' AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = ${staffCashAdvances.expenseId} AND e.status = 'pending_approval'))`;

async function findEmployee(rawCode: string) {
  const code = normalizeEmployeeCode(rawCode);
  const [row] = await getDb()
    .select({ staffUserId: staffWageConfig.staffUserId, name: user.name })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .where(eq(staffWageConfig.absenCode, code))
    .limit(1);
  if (!row) throw new PayrollPaymentError("NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
  return { ...row, code };
}

function assertUntil(until: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until > jakartaDateKey(now)) {
    throw new PayrollPaymentError("DATE_INVALID", "Tanggal gajian tidak boleh di masa depan.");
  }
}

export interface PayableRow {
  code: string;
  name: string;
  position: string | null;
  active: boolean;
  gaji: number;
  fee: number;
  advance: number; // kasbon belum lunas (sudah boleh dipotong)
  advancePending: number; // kasbon menunggu Approvals (belum dipotong)
  deduction: number; // kasbon yang akan dipotong gajian ini
  net: number; // uang yang diserahkan
  carryOver: number; // sisa kasbon terbawa
  firstDate: string | null;
  lastDate: string | null;
  pendingDays: number; // absen belum final (lupa check-out / shift berjalan) s/d until
}

/**
 * Tanggal ≤ until (30 hari terakhir) yang belum final: fee hari itu belum dibagi
 * atau masih ada absen "pending". Gajian tetap boleh — bagian itu menyusul di
 * gajian berikutnya — tapi manajer diberi tahu.
 */
export async function getUnfinalizedDates(until: string, now = new Date()): Promise<string[]> {
  const from = jakartaDateKey(new Date(now.getTime() - 30 * 86_400_000));
  const db = getDb();
  const [pools, pending] = await Promise.all([
    db
      .select({ date: feePoolDaily.date })
      .from(feePoolDaily)
      .where(and(isNull(feePoolDaily.finalizedAt), lte(feePoolDaily.date, until), sql`${feePoolDaily.date} >= ${from}`)),
    db
      .selectDistinct({ date: staffAttendanceV2.date })
      .from(staffAttendanceV2)
      .where(
        and(
          eq(staffAttendanceV2.status, "pending"),
          lte(staffAttendanceV2.date, until),
          sql`${staffAttendanceV2.date} >= ${from}`,
        ),
      ),
  ]);
  return [...new Set([...pools, ...pending].map((r) => String(r.date)))].sort();
}

/** Hitung gaji + fee belum dibayar s/d `until` dan kasbon per karyawan. */
export async function getPayables(until: string, now = new Date()): Promise<PayableRow[]> {
  assertUntil(until, now);
  const db = getDb();
  const employees = await db
    .select({
      staffUserId: staffWageConfig.staffUserId,
      code: staffWageConfig.absenCode,
      name: user.name,
      position: staffProfiles.position,
      status: staffProfiles.status,
    })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(isNotNull(staffWageConfig.absenCode))
    .orderBy(staffWageConfig.absenCode);
  if (employees.length === 0) return [];
  const ids = employees.map((e) => e.staffUserId);

  const [wages, fees, advances, pendingAdvances, pendingAtt] = await Promise.all([
    db
      .select({
        staffUserId: staffDailyWages.staffUserId,
        total: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)`,
        first: sql<string | null>`MIN(${staffDailyWages.date})`,
        last: sql<string | null>`MAX(${staffDailyWages.date})`,
      })
      .from(staffDailyWages)
      .where(
        and(
          inArray(staffDailyWages.staffUserId, ids),
          isNull(staffDailyWages.payoutId),
          lte(staffDailyWages.date, until),
        ),
      )
      .groupBy(staffDailyWages.staffUserId),
    db
      .select({
        staffUserId: feePoolSplits.staffUserId,
        total: sql<number>`COALESCE(SUM(${feePoolSplits.amount} + ${feePoolSplits.bonusTarget} + ${feePoolSplits.bonusZeroKomplain}), 0)`,
      })
      .from(feePoolSplits)
      .where(
        and(
          inArray(feePoolSplits.staffUserId, ids),
          isNull(feePoolSplits.paymentId),
          lte(feePoolSplits.date, until),
        ),
      )
      .groupBy(feePoolSplits.staffUserId),
    db
      .select({
        staffUserId: staffCashAdvances.staffUserId,
        total: sql<number>`COALESCE(SUM(${staffCashAdvances.amount} - ${staffCashAdvances.settledAmount}), 0)`,
      })
      .from(staffCashAdvances)
      .where(
        and(
          inArray(staffCashAdvances.staffUserId, ids),
          gt(staffCashAdvances.amount, staffCashAdvances.settledAmount),
          deductibleAdvance,
        ),
      )
      .groupBy(staffCashAdvances.staffUserId),
    db
      .select({
        staffUserId: staffCashAdvances.staffUserId,
        total: sql<number>`COALESCE(SUM(${staffCashAdvances.amount} - ${staffCashAdvances.settledAmount}), 0)`,
      })
      .from(staffCashAdvances)
      .where(and(inArray(staffCashAdvances.staffUserId, ids), pendingAdvance))
      .groupBy(staffCashAdvances.staffUserId),
    db
      .select({ staffUserId: staffAttendanceV2.staffUserId, total: sql<number>`COUNT(*)` })
      .from(staffAttendanceV2)
      .where(
        and(
          inArray(staffAttendanceV2.staffUserId, ids),
          eq(staffAttendanceV2.status, "pending"),
          lte(staffAttendanceV2.date, until),
        ),
      )
      .groupBy(staffAttendanceV2.staffUserId),
  ]);

  const byId = <T extends { staffUserId: string }>(rows: T[]) => new Map(rows.map((r) => [r.staffUserId, r]));
  const wageBy = byId(wages);
  const feeBy = byId(fees);
  const advBy = byId(advances);
  const pendAdvBy = byId(pendingAdvances);
  const pendAttBy = byId(pendingAtt);

  return employees
    .map((e) => {
      const gaji = Number(wageBy.get(e.staffUserId)?.total ?? 0);
      const fee = Number(feeBy.get(e.staffUserId)?.total ?? 0);
      const advance = Number(advBy.get(e.staffUserId)?.total ?? 0);
      const deduction = Math.min(advance, Math.max(0, gaji + fee));
      const w = wageBy.get(e.staffUserId);
      return {
        code: e.code ?? "",
        name: e.name,
        position: e.position,
        active: e.status === "active",
        gaji,
        fee,
        advance,
        advancePending: Number(pendAdvBy.get(e.staffUserId)?.total ?? 0),
        deduction,
        net: Math.max(0, gaji + fee - deduction),
        carryOver: advance - deduction,
        firstDate: w?.first ? String(w.first) : null,
        lastDate: w?.last ? String(w.last) : null,
        pendingDays: Number(pendAttBy.get(e.staffUserId)?.total ?? 0),
      };
    })
    .filter((r) => r.active || r.gaji !== 0 || r.fee !== 0 || r.advance !== 0 || r.advancePending !== 0);
}

export interface PayEmployeeInput {
  code: string;
  until: string;
  method: PayMethod;
  note?: string | null;
}

/** Gajian satu karyawan: tandai lunas, potong kasbon, catat pengeluaran ke Finance. */
export async function payEmployee(input: PayEmployeeInput, garage: GarageSession, now = new Date()) {
  assertUntil(input.until, now);
  const emp = await findEmployee(input.code);
  const db = getDb();

  const settled = await db.transaction(async (tx) => {
    // Satu gajian per karyawan pada satu waktu: klik ganda / dua manajer membayar
    // bersamaan menunggu di sini, lalu mendapati semuanya sudah lunas.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payroll-pay:${emp.staffUserId}`}))`);
    const wageRows = await tx
      .select({ id: staffDailyWages.id, total: staffDailyWages.totalCredited })
      .from(staffDailyWages)
      .where(
        and(
          eq(staffDailyWages.staffUserId, emp.staffUserId),
          isNull(staffDailyWages.payoutId),
          lte(staffDailyWages.date, input.until),
        ),
      );
    const feeRows = await tx
      .select({
        id: feePoolSplits.id,
        earningId: feePoolSplits.earningId,
        total: sql<number>`${feePoolSplits.amount} + ${feePoolSplits.bonusTarget} + ${feePoolSplits.bonusZeroKomplain}`,
      })
      .from(feePoolSplits)
      .where(
        and(
          eq(feePoolSplits.staffUserId, emp.staffUserId),
          isNull(feePoolSplits.paymentId),
          lte(feePoolSplits.date, input.until),
        ),
      );
    if (wageRows.length === 0 && feeRows.length === 0) {
      throw new PayrollPaymentError("NOTHING_TO_PAY", `Tidak ada gaji/fee ${emp.name} yang belum dibayar s/d tanggal itu.`);
    }
    const advances = await tx
      .select()
      .from(staffCashAdvances)
      .where(
        and(
          eq(staffCashAdvances.staffUserId, emp.staffUserId),
          gt(staffCashAdvances.amount, staffCashAdvances.settledAmount),
          deductibleAdvance,
        ),
      )
      .orderBy(asc(staffCashAdvances.date), asc(staffCashAdvances.createdAt));

    const grossGaji = wageRows.reduce((s, r) => s + r.total, 0);
    const grossFee = feeRows.reduce((s, r) => s + Number(r.total), 0);
    if (grossGaji + grossFee <= 0) {
      // Mis. hanya tersisa potongan tetap bulanan: terbawa ke gajian berikutnya.
      throw new PayrollPaymentError(
        "NOTHING_TO_PAY",
        `Sisa ${emp.name} s/d tanggal itu ${rp(grossGaji + grossFee)} (potongan) — akan dipotong di gajian berikutnya.`,
      );
    }
    const advanceOutstanding = advances.reduce((s, a) => s + a.amount - a.settledAmount, 0);
    const deduction = Math.min(advanceOutstanding, Math.max(0, grossGaji + grossFee));

    // Lunasi kasbon FIFO (dicatat per kasbon untuk pembatalan tepat).
    const allocations: Array<{ advanceId: string; amount: number }> = [];
    let remaining = deduction;
    for (const a of advances) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, a.amount - a.settledAmount);
      await tx
        .update(staffCashAdvances)
        .set({ settledAmount: a.settledAmount + take })
        .where(eq(staffCashAdvances.id, a.id));
      allocations.push({ advanceId: a.id, amount: take });
      remaining -= take;
    }

    const [payment] = await tx
      .insert(staffPayrollPayments)
      .values({
        staffUserId: emp.staffUserId,
        paidUntil: input.until,
        grossGaji,
        grossFee,
        advanceDeducted: deduction,
        netPaid: grossGaji + grossFee - deduction,
        method: input.method,
        note: input.note?.trim() || null,
        advanceAllocations: allocations,
        createdBy: garage.user.id,
      })
      .returning();

    if (wageRows.length) {
      const marked = await tx
        .update(staffDailyWages)
        .set({ payoutId: payment.id })
        .where(and(inArray(staffDailyWages.id, wageRows.map((r) => r.id)), isNull(staffDailyWages.payoutId)))
        .returning({ id: staffDailyWages.id });
      if (marked.length !== wageRows.length) {
        throw new PayrollPaymentError("ALREADY_PAID", "Sebagian gaji sudah dibayar oleh proses lain. Muat ulang.");
      }
    }
    if (feeRows.length) {
      const markedFee = await tx
        .update(feePoolSplits)
        .set({ paymentId: payment.id })
        .where(and(inArray(feePoolSplits.id, feeRows.map((r) => r.id)), isNull(feePoolSplits.paymentId)))
        .returning({ id: feePoolSplits.id });
      if (markedFee.length !== feeRows.length) {
        throw new PayrollPaymentError("ALREADY_PAID", "Sebagian fee sudah dibayar oleh proses lain. Muat ulang.");
      }
      const earningIds = feeRows.map((r) => r.earningId).filter((x): x is string => Boolean(x));
      if (earningIds.length) {
        await tx.update(staffEarnings).set({ status: "paid" }).where(inArray(staffEarnings.id, earningIds));
      }
    }

    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor: actorOf(garage),
      action: "payroll_payment",
      object: `absen:${emp.code}`,
      device: "manajer-web",
      status: "success",
      metadata: {
        paymentId: payment.id,
        until: input.until,
        grossGaji,
        grossFee,
        advanceDeducted: deduction,
        netPaid: payment.netPaid,
        method: input.method,
      },
    });
    return payment;
  });

  // Catat uang yang benar-benar diserahkan ke Finance (di luar transaksi di atas:
  // createExpense punya transaksinya sendiri).
  const expenses: Array<{ amount: number; status: string; id?: string }> = [];
  if (settled.netPaid > 0) {
    try {
      const exp = await createExpense(
        {
          category: "Gaji Karyawan",
          description: `Gaji ${emp.name} s/d ${input.until}`,
          amount: settled.netPaid,
          paymentMethod: input.method,
          notes: [
            `Gajian ${settled.id}`,
            `gaji ${rp(settled.grossGaji)} + fee ${rp(settled.grossFee)}`,
            settled.advanceDeducted ? `potong kasbon ${rp(settled.advanceDeducted)}` : null,
            input.note?.trim() || null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
        garage,
      );
      expenses.push({ amount: settled.netPaid, status: exp.status, id: exp.id });
      await db
        .update(staffPayrollPayments)
        .set({ gajiExpenseId: exp.id })
        .where(eq(staffPayrollPayments.id, settled.id));
    } catch (err) {
      expenses.push({ amount: settled.netPaid, status: `gagal: ${(err as Error).message}` });
    }
  }

  return {
    code: emp.code,
    name: emp.name,
    paymentId: settled.id,
    grossGaji: settled.grossGaji,
    grossFee: settled.grossFee,
    advanceDeducted: settled.advanceDeducted,
    netPaid: settled.netPaid,
    expenses,
  };
}

type PaymentRow = typeof staffPayrollPayments.$inferSelect;

/** Kembalikan gajian: gaji/fee "belum dibayar" lagi, potongan kasbon dikembalikan. */
async function reversePaymentInTx(tx: Tx, payment: PaymentRow, actor: string, reason: string, now: Date) {
  await tx.update(staffDailyWages).set({ payoutId: null }).where(eq(staffDailyWages.payoutId, payment.id));
  const splits = await tx
    .update(feePoolSplits)
    .set({ paymentId: null })
    .where(eq(feePoolSplits.paymentId, payment.id))
    .returning({ earningId: feePoolSplits.earningId });
  const earningIds = splits.map((s) => s.earningId).filter((x): x is string => Boolean(x));
  if (earningIds.length) {
    await tx.update(staffEarnings).set({ status: "accrued" }).where(inArray(staffEarnings.id, earningIds));
  }

  let allocations = payment.advanceAllocations ?? [];
  if (allocations.length === 0 && payment.advanceDeducted > 0) {
    // Baris lama tanpa rincian: kembalikan dari kasbon yang terakhir dilunasi.
    const settledAdvances = await tx
      .select()
      .from(staffCashAdvances)
      .where(and(eq(staffCashAdvances.staffUserId, payment.staffUserId), gt(staffCashAdvances.settledAmount, 0)))
      .orderBy(desc(staffCashAdvances.date), desc(staffCashAdvances.createdAt));
    let left = payment.advanceDeducted;
    allocations = [];
    for (const a of settledAdvances) {
      if (left <= 0) break;
      const back = Math.min(left, a.settledAmount);
      allocations.push({ advanceId: a.id, amount: back });
      left -= back;
    }
  }
  for (const a of allocations) {
    await tx
      .update(staffCashAdvances)
      .set({ settledAmount: sql`GREATEST(0, ${staffCashAdvances.settledAmount} - ${a.amount})` })
      .where(eq(staffCashAdvances.id, a.advanceId));
  }

  await tx
    .update(staffPayrollPayments)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
    .where(eq(staffPayrollPayments.id, payment.id));
  await tx.insert(auditLogs).values({
    time: now.toISOString(),
    actor,
    action: "payroll_payment_cancel",
    object: `payment:${payment.id}`,
    device: "manajer-web",
    status: "success",
    metadata: { paymentId: payment.id, netPaid: payment.netPaid, advanceDeducted: payment.advanceDeducted, reason },
  });
}

/** Batalkan gajian (salah input). Pengeluaran Finance-nya ikut dibatalkan. */
export async function cancelPayment(paymentId: string, reason: string, garage: GarageSession, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [payment] = await tx.select().from(staffPayrollPayments).where(eq(staffPayrollPayments.id, paymentId)).limit(1);
    if (!payment) throw new PayrollPaymentError("NOT_FOUND", "Gajian tidak ditemukan.");
    if (payment.status !== "paid") throw new PayrollPaymentError("ALREADY_CANCELLED", "Gajian ini sudah dibatalkan.");
    for (const expenseId of [payment.gajiExpenseId, payment.feeExpenseId]) {
      if (expenseId) await cancelExpenseInTx(tx, expenseId, garage, `Gajian dibatalkan: ${reason}`);
    }
    await reversePaymentInTx(tx, payment, actorOf(garage), reason, now);
    return { paymentId, netPaid: payment.netPaid, advanceRestored: payment.advanceDeducted };
  });
}

/** Batalkan kasbon yang belum dipotong gajian. Pengeluaran Finance-nya ikut dibatalkan. */
export async function cancelAdvance(advanceId: string, reason: string, garage: GarageSession, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [advance] = await tx.select().from(staffCashAdvances).where(eq(staffCashAdvances.id, advanceId)).limit(1);
    if (!advance) throw new PayrollPaymentError("NOT_FOUND", "Kasbon tidak ditemukan.");
    if (advance.status !== "active") throw new PayrollPaymentError("ALREADY_CANCELLED", "Kasbon ini sudah dibatalkan.");
    if (advance.settledAmount > 0) {
      throw new PayrollPaymentError(
        "ADVANCE_SETTLED",
        "Kasbon ini sudah dipotong di gajian. Batalkan gajiannya dulu bila memang salah.",
      );
    }
    if (advance.expenseId) await cancelExpenseInTx(tx, advance.expenseId, garage, `Kasbon dibatalkan: ${reason}`);
    await tx
      .update(staffCashAdvances)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
      .where(eq(staffCashAdvances.id, advanceId));
    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor: actorOf(garage),
      action: "payroll_advance_cancel",
      object: `advance:${advanceId}`,
      device: "manajer-web",
      status: "success",
      metadata: { advanceId, amount: advance.amount, reason },
    });
    return { advanceId, amount: advance.amount };
  });
}

/**
 * Dipanggil dari decideExpense (di dalam transaksinya) saat pengeluaran DITOLAK:
 * gajian/kasbon yang terkait ikut dibatalkan.
 */
export async function reversePayrollForRejectedExpense(tx: Tx, expenseId: string, actor: string, now = new Date()) {
  const reason = "Pengeluaran ditolak di Persetujuan";
  const [payment] = await tx
    .select()
    .from(staffPayrollPayments)
    .where(
      and(
        eq(staffPayrollPayments.status, "paid"),
        sql`(${staffPayrollPayments.gajiExpenseId} = ${expenseId} OR ${staffPayrollPayments.feeExpenseId} = ${expenseId})`,
      ),
    )
    .limit(1);
  if (payment) {
    await reversePaymentInTx(tx, payment, actor, reason, now);
    return "payment_cancelled" as const;
  }
  const [advance] = await tx
    .select()
    .from(staffCashAdvances)
    .where(and(eq(staffCashAdvances.expenseId, expenseId), eq(staffCashAdvances.status, "active")))
    .limit(1);
  if (advance) {
    await tx
      .update(staffCashAdvances)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
      .where(eq(staffCashAdvances.id, advance.id));
    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor,
      action: "payroll_advance_cancel",
      object: `advance:${advance.id}`,
      device: "approvals",
      status: "success",
      metadata: { advanceId: advance.id, amount: advance.amount, reason, settledAmount: advance.settledAmount },
    });
    return "advance_cancelled" as const;
  }
  const [thr] = await tx
    .select({ id: staffThrPayments.id, amount: staffThrPayments.amount })
    .from(staffThrPayments)
    .where(and(eq(staffThrPayments.expenseId, expenseId), eq(staffThrPayments.status, "paid")))
    .limit(1);
  if (thr) {
    await tx
      .update(staffThrPayments)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
      .where(eq(staffThrPayments.id, thr.id));
    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor,
      action: "payroll_thr_cancel",
      object: `thr:${thr.id}`,
      device: "approvals",
      status: "success",
      metadata: { thrId: thr.id, amount: thr.amount, reason },
    });
    return "thr_cancelled" as const;
  }
  return null;
}

export interface GiveAdvanceInput {
  code: string;
  amount: number;
  method: PayMethod;
  note?: string | null;
}

/** Catat kasbon (uang keluar sekarang) — dipotong otomatis di gajian berikutnya. */
export async function giveAdvance(input: GiveAdvanceInput, garage: GarageSession, now = new Date()) {
  if (!Number.isInteger(input.amount) || input.amount < 1_000 || input.amount > 50_000_000) {
    throw new PayrollPaymentError("AMOUNT_INVALID", "Nominal kasbon Rp 1.000 – Rp 50.000.000.");
  }
  const emp = await findEmployee(input.code);
  const db = getDb();
  const [advance] = await db
    .insert(staffCashAdvances)
    .values({
      staffUserId: emp.staffUserId,
      date: jakartaDateKey(now),
      amount: input.amount,
      method: input.method,
      note: input.note?.trim() || null,
      createdBy: garage.user.id,
    })
    .returning();

  let expenseStatus = "recorded";
  try {
    const exp = await createExpense(
      {
        category: "Kasbon",
        description: `Kasbon ${emp.name}`,
        amount: input.amount,
        paymentMethod: input.method,
        notes: [`Kasbon ${advance.id}`, input.note?.trim() || null].filter(Boolean).join(" · "),
      },
      garage,
    );
    expenseStatus = exp.status;
    await db.update(staffCashAdvances).set({ expenseId: exp.id }).where(eq(staffCashAdvances.id, advance.id));
  } catch (err) {
    expenseStatus = `gagal: ${(err as Error).message}`;
  }

  await db.insert(auditLogs).values({
    time: now.toISOString(),
    actor: actorOf(garage),
    action: "payroll_advance",
    object: `absen:${emp.code}`,
    device: "manajer-web",
    status: "success",
    metadata: { advanceId: advance.id, amount: input.amount, method: input.method },
  });

  return { code: emp.code, name: emp.name, amount: input.amount, expenseStatus };
}

/** Riwayat gajian & kasbon terbaru untuk layar manajer. */
export async function getPaymentHistory(limit = 30) {
  const db = getDb();
  const expenseStatus = (col: typeof staffCashAdvances.expenseId | typeof staffPayrollPayments.gajiExpenseId) =>
    sql<string | null>`(SELECT e.status FROM expenses e WHERE e.id = ${col})`;
  const [payments, advances] = await Promise.all([
    db
      .select({
        id: staffPayrollPayments.id,
        name: user.name,
        code: staffWageConfig.absenCode,
        paidUntil: staffPayrollPayments.paidUntil,
        grossGaji: staffPayrollPayments.grossGaji,
        grossFee: staffPayrollPayments.grossFee,
        advanceDeducted: staffPayrollPayments.advanceDeducted,
        netPaid: staffPayrollPayments.netPaid,
        method: staffPayrollPayments.method,
        status: staffPayrollPayments.status,
        cancelReason: staffPayrollPayments.cancelReason,
        expenseStatus: expenseStatus(staffPayrollPayments.gajiExpenseId),
        createdAt: staffPayrollPayments.createdAt,
      })
      .from(staffPayrollPayments)
      .innerJoin(user, eq(user.id, staffPayrollPayments.staffUserId))
      .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffPayrollPayments.staffUserId))
      .orderBy(desc(staffPayrollPayments.createdAt))
      .limit(limit),
    db
      .select({
        id: staffCashAdvances.id,
        name: user.name,
        code: staffWageConfig.absenCode,
        date: staffCashAdvances.date,
        amount: staffCashAdvances.amount,
        settledAmount: staffCashAdvances.settledAmount,
        method: staffCashAdvances.method,
        note: staffCashAdvances.note,
        status: staffCashAdvances.status,
        cancelReason: staffCashAdvances.cancelReason,
        expenseStatus: expenseStatus(staffCashAdvances.expenseId),
      })
      .from(staffCashAdvances)
      .innerJoin(user, eq(user.id, staffCashAdvances.staffUserId))
      .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffCashAdvances.staffUserId))
      .orderBy(desc(staffCashAdvances.createdAt))
      .limit(limit),
  ]);
  return {
    payments: payments.map((p) => ({ ...p, paidUntil: String(p.paidUntil), createdAt: p.createdAt.toISOString() })),
    advances: advances.map((a) => ({ ...a, date: String(a.date) })),
  };
}

/** Ringkasan pembayaran untuk slip gaji satu bulan. */
export async function getPaymentStatusForMonth(
  db: DbOrTx,
  staffUserIds: string[],
  monthStart: string,
  monthEnd: string,
) {
  if (staffUserIds.length === 0) return new Map<string, PaymentStatusForMonth>();
  const [wageRows, feeRows, payments, advances] = await Promise.all([
    db
      .select({
        staffUserId: staffDailyWages.staffUserId,
        paid: sql<number>`COALESCE(SUM(CASE WHEN ${staffDailyWages.payoutId} IS NOT NULL THEN ${staffDailyWages.totalCredited} ELSE 0 END), 0)`,
        unpaid: sql<number>`COALESCE(SUM(CASE WHEN ${staffDailyWages.payoutId} IS NULL THEN ${staffDailyWages.totalCredited} ELSE 0 END), 0)`,
      })
      .from(staffDailyWages)
      .where(
        and(
          inArray(staffDailyWages.staffUserId, staffUserIds),
          sql`${staffDailyWages.date} >= ${monthStart}`,
          lte(staffDailyWages.date, monthEnd),
        ),
      )
      .groupBy(staffDailyWages.staffUserId),
    db
      .select({
        staffUserId: feePoolSplits.staffUserId,
        paid: sql<number>`COALESCE(SUM(CASE WHEN ${feePoolSplits.paymentId} IS NOT NULL THEN ${feePoolSplits.amount} ELSE 0 END), 0)`,
        unpaid: sql<number>`COALESCE(SUM(CASE WHEN ${feePoolSplits.paymentId} IS NULL THEN ${feePoolSplits.amount} ELSE 0 END), 0)`,
      })
      .from(feePoolSplits)
      .where(
        and(
          inArray(feePoolSplits.staffUserId, staffUserIds),
          sql`${feePoolSplits.date} >= ${monthStart}`,
          lte(feePoolSplits.date, monthEnd),
        ),
      )
      .groupBy(feePoolSplits.staffUserId),
    // Gajian yang mencakup hari di bulan ini.
    db
      .select({
        id: staffPayrollPayments.id,
        staffUserId: staffPayrollPayments.staffUserId,
        paidUntil: staffPayrollPayments.paidUntil,
        netPaid: staffPayrollPayments.netPaid,
        advanceDeducted: staffPayrollPayments.advanceDeducted,
        method: staffPayrollPayments.method,
        createdAt: staffPayrollPayments.createdAt,
      })
      .from(staffPayrollPayments)
      .where(
        and(
          inArray(staffPayrollPayments.staffUserId, staffUserIds),
          eq(staffPayrollPayments.status, "paid"),
          sql`(EXISTS (SELECT 1 FROM staff_daily_wages w WHERE w.payout_id = ${staffPayrollPayments.id} AND w.date >= ${monthStart} AND w.date <= ${monthEnd})
            OR EXISTS (SELECT 1 FROM fee_pool_splits f WHERE f.payment_id = ${staffPayrollPayments.id} AND f.date >= ${monthStart} AND f.date <= ${monthEnd}))`,
        ),
      )
      .orderBy(asc(staffPayrollPayments.createdAt)),
    db
      .select({
        staffUserId: staffCashAdvances.staffUserId,
        total: sql<number>`COALESCE(SUM(${staffCashAdvances.amount} - ${staffCashAdvances.settledAmount}), 0)`,
      })
      .from(staffCashAdvances)
      .where(and(inArray(staffCashAdvances.staffUserId, staffUserIds), deductibleAdvance))
      .groupBy(staffCashAdvances.staffUserId),
  ]);

  const out = new Map<string, PaymentStatusForMonth>();
  for (const id of staffUserIds) {
    const w = wageRows.find((r) => r.staffUserId === id);
    const f = feeRows.find((r) => r.staffUserId === id);
    const paid = Number(w?.paid ?? 0) + Number(f?.paid ?? 0);
    const unpaid = Number(w?.unpaid ?? 0) + Number(f?.unpaid ?? 0);
    out.set(id, {
      state: paid === 0 && unpaid === 0 ? "kosong" : unpaid === 0 ? "lunas" : paid === 0 ? "belum" : "sebagian",
      paidAmount: paid,
      unpaidAmount: unpaid,
      advanceOutstanding: Number(advances.find((r) => r.staffUserId === id)?.total ?? 0),
      payments: payments
        .filter((p) => p.staffUserId === id)
        .map((p) => ({
          paidAt: p.createdAt.toISOString(),
          paidUntil: String(p.paidUntil),
          method: p.method,
          netPaid: p.netPaid,
          advanceDeducted: p.advanceDeducted,
        })),
    });
  }
  return out;
}

export interface PaymentStatusForMonth {
  state: "lunas" | "sebagian" | "belum" | "kosong";
  paidAmount: number;
  unpaidAmount: number;
  advanceOutstanding: number;
  payments: Array<{ paidAt: string; paidUntil: string; method: string; netPaid: number; advanceDeducted: number }>;
  // THR yang dibayar dalam bulan slip (di luar gaji bulanan).
  thr?: Array<{ holidayName: string; amount: number; paidAt: string }>;
}
