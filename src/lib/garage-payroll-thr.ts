// Payroll V2 — THR (Tunjangan Hari Raya).
//
// Rumus (mengikuti ketentuan umum THR keagamaan):
//   masa kerja < 1 bulan      → tidak berhak (Rp 0)
//   masa kerja 1–12 bulan     → masa kerja (bulan penuh) / 12 × gaji bulanan
//   masa kerja ≥ 12 bulan     → 1 × gaji bulanan
// Masa kerja dihitung dari `staff_wage_config.join_date` (atau tanggal akun absen
// dibuat bila kosong) sampai tanggal hari raya.
//
// Finance: expense "THR Karyawan" (grup payroll → masuk laba rugi, karena THR
// tidak dicatat di gaji harian). ≥ batas approval → Approvals; ditolak → THR batal.

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { financeExpenseCategories } from "@/db/schema-finance";
import {
  auditLogs,
  expenses,
  staffProfiles,
  staffThrPayments,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import { normalizeEmployeeCode } from "@/lib/garage-absen-employees";
import { PayrollPaymentError, type PayMethod } from "@/lib/garage-payroll-payments";
import { cancelExpenseInTx, createExpense } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

export const THR_CATEGORY = "THR Karyawan";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const actorOf = (garage: GarageSession) => garage.user.name || garage.user.email;

/** Bulan penuh antara dua tanggal (YYYY-MM-DD). */
export function fullMonthsBetween(from: string, to: string): number {
  if (to < from) return 0;
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** Besaran THR dari masa kerja (bulan penuh) dan gaji bulanan. */
export function thrAmount(monthsWorked: number, monthlySalary: number): number {
  if (monthsWorked < 1 || monthlySalary <= 0) return 0;
  if (monthsWorked >= 12) return monthlySalary;
  return Math.round((monthsWorked / 12) * monthlySalary);
}

function assertHolidayDate(date: string) {
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    throw new PayrollPaymentError("DATE_INVALID", "Tanggal hari raya tidak valid.");
  }
}

export interface ThrRow {
  code: string;
  name: string;
  position: string | null;
  joinDate: string;
  joinEstimated: boolean; // tanggal mulai kerja belum diisi → pakai tanggal akun absen
  monthsWorked: number;
  monthlySalary: number;
  amount: number;
  paid: { id: string; amount: number; paidAt: string; expenseStatus: string | null } | null;
}

async function employeesForThr(codes?: string[]) {
  const rows = await getDb()
    .select({
      staffUserId: staffWageConfig.staffUserId,
      code: staffWageConfig.absenCode,
      name: user.name,
      position: staffProfiles.position,
      status: staffProfiles.status,
      joinDate: staffWageConfig.joinDate,
      createdAt: user.createdAt,
      monthlySalary: staffWageConfig.monthlySalary,
      dailyWage: staffWageConfig.dailyWage,
    })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(codes ? inArray(staffWageConfig.absenCode, codes) : isNotNull(staffWageConfig.absenCode))
    .orderBy(staffWageConfig.absenCode);
  return rows.map((r) => {
    const joinDate = r.joinDate ? String(r.joinDate) : jakartaDateKey(r.createdAt);
    return {
      ...r,
      joinDate,
      joinEstimated: !r.joinDate,
      salary: r.monthlySalary ?? Math.round(((r.dailyWage ?? 0) * 30) / 1_000) * 1_000,
    };
  });
}

/** Daftar THR per karyawan aktif untuk satu hari raya. */
export async function getThrList(holidayDate: string): Promise<ThrRow[]> {
  assertHolidayDate(holidayDate);
  const employees = (await employeesForThr()).filter((e) => e.status === "active");
  if (employees.length === 0) return [];
  const paid = await getDb()
    .select({
      id: staffThrPayments.id,
      staffUserId: staffThrPayments.staffUserId,
      amount: staffThrPayments.amount,
      createdAt: staffThrPayments.createdAt,
      expenseId: staffThrPayments.expenseId,
    })
    .from(staffThrPayments)
    .where(and(eq(staffThrPayments.holidayDate, holidayDate), eq(staffThrPayments.status, "paid")));
  const expenseStatus = await expenseStatuses(paid.map((p) => p.expenseId).filter((x): x is string => Boolean(x)));

  return employees.map((e) => {
    const monthsWorked = fullMonthsBetween(e.joinDate, holidayDate);
    const p = paid.find((x) => x.staffUserId === e.staffUserId);
    return {
      code: e.code ?? "",
      name: e.name,
      position: e.position,
      joinDate: e.joinDate,
      joinEstimated: e.joinEstimated,
      monthsWorked,
      monthlySalary: e.salary,
      amount: thrAmount(monthsWorked, e.salary),
      paid: p
        ? {
            id: p.id,
            amount: p.amount,
            paidAt: p.createdAt.toISOString(),
            expenseStatus: p.expenseId ? (expenseStatus.get(p.expenseId) ?? null) : null,
          }
        : null,
    };
  });
}

async function expenseStatuses(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await getDb()
    .select({ id: expenses.id, status: expenses.status })
    .from(expenses)
    .where(inArray(expenses.id, ids));
  return new Map(rows.map((r) => [r.id, r.status]));
}

export interface PayThrInput {
  code: string;
  holidayName: string;
  holidayDate: string;
  method: PayMethod;
  note?: string | null;
}

/** Bayar THR satu karyawan untuk satu hari raya (sekali per hari raya). */
export async function payThr(input: PayThrInput, garage: GarageSession, now = new Date()) {
  assertHolidayDate(input.holidayDate);
  const code = normalizeEmployeeCode(input.code);
  const [emp] = await employeesForThr([code]);
  if (!emp) throw new PayrollPaymentError("NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
  const monthsWorked = fullMonthsBetween(emp.joinDate, input.holidayDate);
  const amount = thrAmount(monthsWorked, emp.salary);
  if (amount <= 0) {
    throw new PayrollPaymentError(
      "NOT_ELIGIBLE",
      `${emp.name} belum berhak THR (masa kerja ${monthsWorked} bulan, minimal 1 bulan).`,
    );
  }
  const db = getDb();
  const holidayName = input.holidayName.trim();

  const row = await db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: staffThrPayments.id })
      .from(staffThrPayments)
      .where(
        and(
          eq(staffThrPayments.staffUserId, emp.staffUserId),
          eq(staffThrPayments.holidayDate, input.holidayDate),
          eq(staffThrPayments.status, "paid"),
        ),
      )
      .limit(1);
    if (dup) throw new PayrollPaymentError("ALREADY_PAID", `THR ${emp.name} untuk hari raya ini sudah dibayar.`);
    const [created] = await tx
      .insert(staffThrPayments)
      .values({
        staffUserId: emp.staffUserId,
        holidayName,
        holidayDate: input.holidayDate,
        monthsWorked,
        baseSalary: emp.salary,
        amount,
        method: input.method,
        note: input.note?.trim() || null,
        createdBy: garage.user.id,
      })
      .returning();
    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor: actorOf(garage),
      action: "payroll_thr",
      object: `absen:${code}`,
      device: "manajer-web",
      status: "success",
      metadata: { thrId: created.id, holidayName, holidayDate: input.holidayDate, monthsWorked, amount },
    });
    return created;
  });

  let expenseStatus = "recorded";
  try {
    // Kategori THR masuk grup payroll (laba rugi). Aman dipanggil berulang.
    await db
      .insert(financeExpenseCategories)
      .values({ name: THR_CATEGORY, groupKey: "payroll", costClass: "fixed", costItemCode: null })
      .onConflictDoNothing();
    const exp = await createExpense(
      {
        category: THR_CATEGORY,
        description: `THR ${holidayName} ${emp.name}`,
        amount,
        paymentMethod: input.method,
        // Payroll dibayar dari uang Owner/rekening, bukan dari laci kasir.
        cashSource: "external",
        notes: [
          `THR ${row.id}`,
          monthsWorked >= 12 ? "masa kerja ≥ 12 bulan" : `masa kerja ${monthsWorked}/12 bulan`,
          input.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      garage,
    );
    expenseStatus = exp.status;
    await db.update(staffThrPayments).set({ expenseId: exp.id }).where(eq(staffThrPayments.id, row.id));
  } catch (err) {
    expenseStatus = `gagal: ${(err as Error).message}`;
  }

  return { id: row.id, code, name: emp.name, amount, monthsWorked, expenseStatus };
}

/** Batalkan THR (salah input). Pengeluaran Finance-nya ikut dibatalkan. */
export async function cancelThr(id: string, reason: string, garage: GarageSession, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(staffThrPayments).where(eq(staffThrPayments.id, id)).limit(1);
    if (!row) throw new PayrollPaymentError("NOT_FOUND", "THR tidak ditemukan.");
    if (row.status !== "paid") throw new PayrollPaymentError("ALREADY_CANCELLED", "THR ini sudah dibatalkan.");
    if (row.expenseId) await cancelExpenseInTx(tx, row.expenseId, garage, `THR dibatalkan: ${reason}`);
    await tx
      .update(staffThrPayments)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: reason })
      .where(eq(staffThrPayments.id, id));
    await tx.insert(auditLogs).values({
      time: now.toISOString(),
      actor: actorOf(garage),
      action: "payroll_thr_cancel",
      object: `thr:${id}`,
      device: "manajer-web",
      status: "success",
      metadata: { thrId: id, amount: row.amount, reason },
    });
    return { id, amount: row.amount };
  });
}

/** Riwayat THR terbaru. */
export async function getThrHistory(limit = 40) {
  const rows = await getDb()
    .select({
      id: staffThrPayments.id,
      name: user.name,
      code: staffWageConfig.absenCode,
      holidayName: staffThrPayments.holidayName,
      holidayDate: staffThrPayments.holidayDate,
      monthsWorked: staffThrPayments.monthsWorked,
      amount: staffThrPayments.amount,
      method: staffThrPayments.method,
      status: staffThrPayments.status,
      cancelReason: staffThrPayments.cancelReason,
      expenseId: staffThrPayments.expenseId,
      createdAt: staffThrPayments.createdAt,
    })
    .from(staffThrPayments)
    .innerJoin(user, eq(user.id, staffThrPayments.staffUserId))
    .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffThrPayments.staffUserId))
    .orderBy(desc(staffThrPayments.createdAt))
    .limit(limit);
  const statuses = await expenseStatuses(rows.map((r) => r.expenseId).filter((x): x is string => Boolean(x)));
  return rows.map(({ expenseId, ...r }) => ({
    ...r,
    holidayDate: String(r.holidayDate),
    createdAt: r.createdAt.toISOString(),
    expenseStatus: expenseId ? (statuses.get(expenseId) ?? null) : null,
  }));
}

/** THR yang dibayar dalam rentang tanggal (untuk slip gaji bulan itu). */
export async function getThrPaidBetween(staffUserIds: string[], fromIso: Date, toIso: Date) {
  if (staffUserIds.length === 0) return [];
  const rows = await getDb()
    .select({
      staffUserId: staffThrPayments.staffUserId,
      holidayName: staffThrPayments.holidayName,
      amount: staffThrPayments.amount,
      createdAt: staffThrPayments.createdAt,
    })
    .from(staffThrPayments)
    .where(and(inArray(staffThrPayments.staffUserId, staffUserIds), eq(staffThrPayments.status, "paid")));
  return rows.filter((r) => r.createdAt >= fromIso && r.createdAt <= toIso);
}
