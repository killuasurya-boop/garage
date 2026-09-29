// Payroll V2 — kelola karyawan absen (identitas KODE + PIN, bukan akun sistem).
// Dipakai layar owner /owner/payroll/employees dan skrip payroll:seed.
// Karyawan tidak pernah dihapus (riwayat gaji tetap utuh) — cukup dinonaktifkan.

import { randomInt } from "node:crypto";

import { eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, staffProfiles, staffWageConfig, user } from "@/db/schema";
import { hashPin } from "@/lib/attendance";

export const DAYS_PER_MONTH = 30;
export const DEFAULT_OVERTIME_HOURLY = 3_000;

export class AbsenEmployeeError extends Error {
  constructor(
    public code: "CODE_TAKEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AbsenEmployeeError";
  }
}

export interface AbsenEmployeeView {
  code: string;
  name: string;
  position: string | null;
  monthlySalary: number;
  dailyWage: number;
  shiftStart: string | null; // "HH:MM"; null = jam buka toko
  excludeFromFee: boolean;
  active: boolean;
  hasPin: boolean;
  joinDate: string | null; // tanggal mulai kerja (dasar THR); null = belum diisi
  monthlyDeduction: number; // potongan tetap/bulan (mis. iuran BPJS bagian karyawan)
}

export interface AbsenActor {
  name: string;
  outletId: string;
}

export function normalizeEmployeeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function dailyFromMonthly(monthlySalary: number): number {
  return Math.round(monthlySalary / DAYS_PER_MONTH);
}

export function parseShiftStart(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatShiftStart(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** PIN 6 digit acak; hindari PIN mudah ditebak (angka kembar, 123456). */
export function generateAbsenPin(taken: Set<string> = new Set()): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!taken.has(pin) && !/^(\d)\1{5}$/.test(pin) && pin !== "123456" && pin !== "654321") {
      taken.add(pin);
      return pin;
    }
  }
}

const absenUserId = (code: string) => `payroll-${code.toLowerCase()}`;

async function writeAudit(
  actor: AbsenActor,
  action: string,
  code: string,
  metadata: Record<string, unknown>,
) {
  try {
    await getDb().insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: actor.name,
      action,
      object: `absen:${code}`,
      device: "owner-web",
      status: "success",
      metadata,
    });
  } catch {
    /* audit opsional, non-blocking */
  }
}

export async function listAbsenEmployees(): Promise<AbsenEmployeeView[]> {
  const rows = await getDb()
    .select({
      code: staffWageConfig.absenCode,
      name: user.name,
      position: staffProfiles.position,
      monthlySalary: staffWageConfig.monthlySalary,
      dailyWage: staffWageConfig.dailyWage,
      shiftStartMinutes: staffWageConfig.shiftStartMinutes,
      excludeFromFee: staffWageConfig.excludeFromFee,
      status: staffProfiles.status,
      pinHash: staffProfiles.pinHash,
      joinDate: staffWageConfig.joinDate,
      monthlyDeduction: staffWageConfig.monthlyDeduction,
    })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(isNotNull(staffWageConfig.absenCode))
    .orderBy(staffWageConfig.absenCode);

  return rows.map((r) => ({
    code: r.code ?? "",
    name: r.name,
    position: r.position,
    // Data lama tanpa monthly_salary: perkiraan dari harian, dibulatkan ke ribuan
    // (66.667 × 30 → 2.000.000, bukan 2.000.010).
    monthlySalary:
      r.monthlySalary ?? Math.round((r.dailyWage * DAYS_PER_MONTH) / 1_000) * 1_000,
    dailyWage: r.dailyWage,
    shiftStart: formatShiftStart(r.shiftStartMinutes),
    excludeFromFee: r.excludeFromFee,
    active: r.status === "active",
    hasPin: Boolean(r.pinHash),
    joinDate: r.joinDate ? String(r.joinDate) : null,
    monthlyDeduction: r.monthlyDeduction ?? 0,
  }));
}

async function findByCode(code: string) {
  const [row] = await getDb()
    .select({ staffUserId: staffWageConfig.staffUserId })
    .from(staffWageConfig)
    .where(eq(staffWageConfig.absenCode, code))
    .limit(1);
  return row ?? null;
}

export interface CreateAbsenEmployeeInput {
  code: string;
  name: string;
  position?: string | null;
  monthlySalary: number;
  shiftStart?: string | null;
  excludeFromFee?: boolean;
  joinDate?: string | null;
  monthlyDeduction?: number;
}

/** Buat karyawan absen baru. PIN dikembalikan SEKALI (hanya hash yang disimpan). */
export async function createAbsenEmployee(input: CreateAbsenEmployeeInput, actor: AbsenActor) {
  const code = normalizeEmployeeCode(input.code);
  const userId = absenUserId(code);
  const db = getDb();

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if ((await findByCode(code)) || existingUser) {
    throw new AbsenEmployeeError("CODE_TAKEN", `Kode ${code} sudah dipakai karyawan lain.`);
  }

  const pin = generateAbsenPin();
  const shiftStartMinutes = parseShiftStart(input.shiftStart);
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: userId,
      name: input.name.trim(),
      email: `${code.toLowerCase()}@absen.garage.local`,
    });
    await tx.insert(staffProfiles).values({
      userId,
      outletId: actor.outletId,
      role: "Waiter", // label saja — user tanpa password tidak bisa login aplikasi
      position: input.position?.trim() || null,
      division: "Payroll",
      shiftLabel: "Absen HP (bukan akun sistem)",
      deviceLabel: "ABSEN-HP",
      status: "active",
      pinHash: hashPin(pin),
    });
    await tx.insert(staffWageConfig).values({
      staffUserId: userId,
      monthlySalary: input.monthlySalary,
      dailyWage: dailyFromMonthly(input.monthlySalary),
      overtimeHourly: DEFAULT_OVERTIME_HOURLY,
      excludeFromFee: input.excludeFromFee ?? false,
      absenCode: code,
      shiftStartMinutes,
      joinDate: input.joinDate || null,
      monthlyDeduction: input.monthlyDeduction ?? 0,
    });
  });

  await writeAudit(actor, "absen_employee_create", code, {
    name: input.name.trim(),
    position: input.position ?? null,
    monthlySalary: input.monthlySalary,
    shiftStart: formatShiftStart(shiftStartMinutes),
    excludeFromFee: input.excludeFromFee ?? false,
  });
  return { code, pin };
}

export interface UpdateAbsenEmployeeInput {
  name?: string;
  position?: string | null;
  monthlySalary?: number;
  shiftStart?: string | null;
  excludeFromFee?: boolean;
  active?: boolean;
  joinDate?: string | null;
  monthlyDeduction?: number;
}

export async function updateAbsenEmployee(
  rawCode: string,
  patch: UpdateAbsenEmployeeInput,
  actor: AbsenActor,
) {
  const code = normalizeEmployeeCode(rawCode);
  const found = await findByCode(code);
  if (!found) throw new AbsenEmployeeError("NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
  const now = new Date();
  const db = getDb();

  await db.transaction(async (tx) => {
    if (patch.name !== undefined) {
      await tx
        .update(user)
        .set({ name: patch.name.trim(), updatedAt: now })
        .where(eq(user.id, found.staffUserId));
    }
    if (patch.position !== undefined || patch.active !== undefined) {
      await tx
        .update(staffProfiles)
        .set({
          ...(patch.position !== undefined ? { position: patch.position?.trim() || null } : {}),
          ...(patch.active !== undefined ? { status: patch.active ? "active" : "inactive" } : {}),
          updatedAt: now,
        })
        .where(eq(staffProfiles.userId, found.staffUserId));
    }
    if (
      patch.monthlySalary !== undefined ||
      patch.shiftStart !== undefined ||
      patch.excludeFromFee !== undefined ||
      patch.joinDate !== undefined ||
      patch.monthlyDeduction !== undefined
    ) {
      await tx
        .update(staffWageConfig)
        .set({
          ...(patch.monthlySalary !== undefined
            ? { monthlySalary: patch.monthlySalary, dailyWage: dailyFromMonthly(patch.monthlySalary) }
            : {}),
          ...(patch.shiftStart !== undefined
            ? { shiftStartMinutes: parseShiftStart(patch.shiftStart) }
            : {}),
          ...(patch.excludeFromFee !== undefined ? { excludeFromFee: patch.excludeFromFee } : {}),
          ...(patch.joinDate !== undefined ? { joinDate: patch.joinDate || null } : {}),
          ...(patch.monthlyDeduction !== undefined ? { monthlyDeduction: patch.monthlyDeduction } : {}),
          updatedAt: now,
        })
        .where(eq(staffWageConfig.staffUserId, found.staffUserId));
    }
  });

  await writeAudit(actor, "absen_employee_update", code, { ...patch });
  return { code };
}

/** Buat PIN baru. PIN dikembalikan SEKALI; PIN lama langsung tidak berlaku. */
export async function resetAbsenPin(rawCode: string, actor: AbsenActor) {
  const code = normalizeEmployeeCode(rawCode);
  const found = await findByCode(code);
  if (!found) throw new AbsenEmployeeError("NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
  const pin = generateAbsenPin();
  await getDb()
    .update(staffProfiles)
    .set({ pinHash: hashPin(pin), updatedAt: new Date() })
    .where(eq(staffProfiles.userId, found.staffUserId));
  await writeAudit(actor, "absen_employee_reset_pin", code, {});
  return { code, pin };
}
