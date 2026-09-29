// Payroll V2 — kontrol absen harian oleh manajer:
//   - papan absen hari ini (siapa masuk / telat / belum datang / izin)
//   - koreksi absen (lupa check-out, HP mati) → gaji & fee hari itu dihitung ulang
//   - izin / sakit / cuti (tidak dihitung "tidak hadir", tetap tidak digaji)
// Semua perubahan tercatat di audit log (sebelum → sesudah, alasan, pelaku).

import { and, eq, gte, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  staffAttendanceV2,
  staffDailyWages,
  staffLeaves,
  staffProfiles,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import {
  OPEN_SHIFT_MAX_MS,
  checkoutMetrics,
  getCurrentAttendance,
  lateMinutesFor,
  resolveShiftStart,
} from "@/lib/garage-attendance-v2";
import { normalizeEmployeeCode } from "@/lib/garage-absen-employees";
import {
  DAILY_WAGE_SOURCE,
  creditDailyWage,
  creditMonthlyAttendanceBonus,
  monthDateKeys,
} from "@/lib/garage-daily-wage";
import { reconcileFeeForStaffDay, type FeeReconcileResult } from "@/lib/garage-fee-pool";
import { LEAVE_TYPES, type LeaveType } from "@/lib/garage-payroll-report";

export const CORRECTION_MAX_DAYS_BACK = 35;
const LEAVE_MAX_DAYS_AHEAD = 60;
const LEAVE_MAX_RANGE = 31;
const NIGHT_SHIFT_FROM = 12 * 60;

export class AbsenControlError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "DATE_INVALID"
      | "TIME_INVALID"
      | "CHECKOUT_REQUIRED"
      | "ALREADY_PAID"
      | "ATTENDANCE_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "AbsenControlError";
  }
}

export interface ControlActor {
  userId: string;
  name: string;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
}

const atWib = (dateKey: string, hhmmValue: string) => new Date(`${dateKey}T${hhmmValue}:00+07:00`);
const clockWib = (d: Date | null) =>
  d
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : null;

async function writeAudit(actor: ControlActor, action: string, object: string, metadata: Record<string, unknown>) {
  try {
    await getDb().insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: actor.name,
      action,
      object,
      device: "manajer-web",
      status: "success",
      metadata,
    });
  } catch {
    /* audit opsional, non-blocking */
  }
}

async function findEmployee(rawCode: string) {
  const code = normalizeEmployeeCode(rawCode);
  const [row] = await getDb()
    .select({ staffUserId: staffWageConfig.staffUserId, name: user.name })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .where(eq(staffWageConfig.absenCode, code))
    .limit(1);
  if (!row) throw new AbsenControlError("NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
  return { ...row, code };
}

// ---------------------------------------------------------------------------
// Papan absen hari ini
// ---------------------------------------------------------------------------

export type BoardState =
  | "belum_waktunya"
  | "belum_datang"
  | "sedang_shift"
  | "selesai"
  | "tidak_valid"
  | LeaveType;

export interface BoardRow {
  code: string;
  name: string;
  position: string | null;
  shiftStart: string;
  state: BoardState;
  shiftDate: string | null;
  checkinAt: string | null;
  checkoutAt: string | null;
  lateMinutes: number; // telat tercatat, atau menit lewat jam masuk bila belum datang
  leaveReason: string | null;
  checkinSelfieUrl: string | null;
  checkoutSelfieUrl: string | null;
  // Nama karyawan lain yang absen memakai HP yang sama (tanda titip absen).
  sharedDeviceWith: string[];
}

/** ID perangkat dari kolom device ("dev:<id> <user-agent>"); data lama tanpa id → null. */
export function deviceIdOf(device: string | null | undefined): string | null {
  const m = /^dev:([\w-]{6,24})/.exec(device ?? "");
  return m ? m[1] : null;
}

export async function getTodayBoard(now = new Date()) {
  const db = getDb();
  const today = jakartaDateKey(now);
  const employees = await db
    .select({
      staffUserId: staffWageConfig.staffUserId,
      code: staffWageConfig.absenCode,
      name: user.name,
      position: staffProfiles.position,
    })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(and(isNotNull(staffWageConfig.absenCode), eq(staffProfiles.status, "active")))
    .orderBy(staffWageConfig.absenCode);

  const leaves = await db
    .select()
    .from(staffLeaves)
    .where(eq(staffLeaves.date, today));
  const leaveBy = new Map(leaves.map((l) => [l.staffUserId, l]));

  const nowMinutes = Math.floor((now.getTime() - atWib(today, "00:00").getTime()) / 60_000);
  const rows: BoardRow[] = [];
  const devicesBy = new Map<string, Set<string>>(); // deviceId → nama karyawan
  const rowDevices = new Map<string, string[]>(); // code → deviceId yang dipakai
  for (const emp of employees) {
    const { openMinutes } = await resolveShiftStart(emp.staffUserId);
    const att = await getCurrentAttendance(emp.staffUserId, now);
    const leave = leaveBy.get(emp.staffUserId);
    let state: BoardState;
    let late = att?.lateMinutes ?? 0;
    if (att?.checkinAt && !att.checkoutAt) state = "sedang_shift";
    else if (att?.checkoutAt) state = att.status === "invalid" ? "tidak_valid" : "selesai";
    else if (leave) state = leave.type as LeaveType;
    else if (nowMinutes < openMinutes) state = "belum_waktunya";
    else {
      state = "belum_datang";
      late = nowMinutes - openMinutes;
    }
    rows.push({
      code: emp.code ?? "",
      name: emp.name,
      position: emp.position,
      shiftStart: hhmm(openMinutes),
      state,
      shiftDate: att ? String(att.date) : null,
      checkinAt: att?.checkinAt ? att.checkinAt.toISOString() : null,
      checkoutAt: att?.checkoutAt ? att.checkoutAt.toISOString() : null,
      lateMinutes: late,
      leaveReason: leave?.reason ?? null,
      checkinSelfieUrl: att?.checkinSelfieUrl ?? null,
      checkoutSelfieUrl: att?.checkoutSelfieUrl ?? null,
      sharedDeviceWith: [],
    });
    const ids = [deviceIdOf(att?.checkinDevice), deviceIdOf(att?.checkoutDevice)].filter((x): x is string => Boolean(x));
    rowDevices.set(emp.code ?? "", ids);
    for (const id of ids) {
      if (!devicesBy.has(id)) devicesBy.set(id, new Set());
      devicesBy.get(id)!.add(emp.name);
    }
  }
  for (const row of rows) {
    const others = new Set<string>();
    for (const id of rowDevices.get(row.code) ?? []) {
      for (const name of devicesBy.get(id) ?? []) if (name !== row.name) others.add(name);
    }
    row.sharedDeviceWith = [...others];
  }

  const count = (...states: BoardState[]) => rows.filter((r) => states.includes(r.state)).length;
  return {
    date: today,
    now: now.toISOString(),
    summary: {
      total: rows.length,
      hadir: count("sedang_shift", "selesai"),
      telat: rows.filter((r) => (r.state === "sedang_shift" || r.state === "selesai") && r.lateMinutes > 0).length,
      belumDatang: count("belum_datang"),
      izin: count(...LEAVE_TYPES),
      sharedDevice: rows.filter((r) => r.sharedDeviceWith.length > 0).length,
    },
    rows,
  };
}

// ---------------------------------------------------------------------------
// Koreksi absen
// ---------------------------------------------------------------------------

export interface CorrectAttendanceInput {
  code: string;
  date: string; // tanggal shift YYYY-MM-DD
  checkin: string; // HH:MM
  checkout?: string | null; // HH:MM (lewat tengah malam otomatis = hari berikutnya)
  reason: string;
}

export async function correctAttendance(input: CorrectAttendanceInput, actor: ControlActor, now = new Date()) {
  const db = getDb();
  const emp = await findEmployee(input.code);
  const today = jakartaDateKey(now);
  const date = input.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
    throw new AbsenControlError("DATE_INVALID", "Tanggal koreksi tidak boleh di masa depan.");
  }
  if (daysBetween(date, today) > CORRECTION_MAX_DAYS_BACK) {
    throw new AbsenControlError("DATE_INVALID", `Koreksi hanya untuk ${CORRECTION_MAX_DAYS_BACK} hari terakhir.`);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.checkin) || (input.checkout && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.checkout))) {
    throw new AbsenControlError("TIME_INVALID", "Jam harus format HH:MM.");
  }

  const [paid] = await db
    .select({ id: staffDailyWages.id })
    .from(staffDailyWages)
    .where(
      and(
        eq(staffDailyWages.staffUserId, emp.staffUserId),
        eq(staffDailyWages.date, date),
        eq(staffDailyWages.source, DAILY_WAGE_SOURCE),
        isNotNull(staffDailyWages.payoutId),
      ),
    )
    .limit(1);
  if (paid) throw new AbsenControlError("ALREADY_PAID", "Gaji hari itu sudah dibayarkan; koreksi tidak bisa dilakukan.");

  const { openMinutes } = await resolveShiftStart(emp.staffUserId);
  const [ih, im] = input.checkin.split(":").map(Number);
  // Shift malam: jam masuk dini hari = hari berikutnya dari tanggal shift.
  const checkinAt = atWib(
    openMinutes >= NIGHT_SHIFT_FROM && ih * 60 + im < NIGHT_SHIFT_FROM ? addDays(date, 1) : date,
    input.checkin,
  );
  let checkoutAt: Date | null = null;
  if (input.checkout) {
    checkoutAt = atWib(date, input.checkout);
    while (checkoutAt <= checkinAt) checkoutAt = new Date(checkoutAt.getTime() + 86_400_000);
    if (checkoutAt.getTime() - checkinAt.getTime() > OPEN_SHIFT_MAX_MS) {
      throw new AbsenControlError("TIME_INVALID", "Durasi shift lebih dari 20 jam — periksa jam masuk/keluar.");
    }
  } else if (daysBetween(date, today) > 1) {
    throw new AbsenControlError("CHECKOUT_REQUIRED", "Jam keluar wajib diisi untuk tanggal yang sudah lewat.");
  }
  if (checkinAt > now || (checkoutAt && checkoutAt > now)) {
    throw new AbsenControlError("TIME_INVALID", "Jam masuk/keluar tidak boleh melewati waktu sekarang.");
  }

  const lateMinutes = lateMinutesFor(date, openMinutes, checkinAt);
  const metrics = checkoutAt
    ? await checkoutMetrics(emp.staffUserId, date, checkinAt, checkoutAt)
    : { workedMinutes: 0, overtimeMinutes: 0, status: "pending" as const };

  const [before] = await db
    .select()
    .from(staffAttendanceV2)
    .where(and(eq(staffAttendanceV2.staffUserId, emp.staffUserId), eq(staffAttendanceV2.date, date)))
    .limit(1);
  const [wageBefore] = await db
    .select({ id: staffDailyWages.id, totalCredited: staffDailyWages.totalCredited })
    .from(staffDailyWages)
    .where(
      and(
        eq(staffDailyWages.staffUserId, emp.staffUserId),
        eq(staffDailyWages.date, date),
        eq(staffDailyWages.source, DAILY_WAGE_SOURCE),
      ),
    )
    .limit(1);

  const note = `Koreksi manajer: ${input.reason.trim()} (${actor.name})`;
  const values = {
    checkinAt,
    checkoutAt,
    lateMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    workedMinutes: metrics.workedMinutes,
    status: metrics.status,
    notes: note,
    updatedAt: now,
  };
  let attendanceId: string;
  if (before) {
    await db.update(staffAttendanceV2).set(values).where(eq(staffAttendanceV2.id, before.id));
    attendanceId = before.id;
  } else {
    const [created] = await db
      .insert(staffAttendanceV2)
      .values({ staffUserId: emp.staffUserId, date, method: "koreksi_manajer", ...values })
      .returning({ id: staffAttendanceV2.id });
    attendanceId = created.id;
  }

  // Karyawan ternyata masuk → izin di tanggal itu tidak berlaku lagi.
  await db
    .delete(staffLeaves)
    .where(and(eq(staffLeaves.staffUserId, emp.staffUserId), eq(staffLeaves.date, date)));

  // Hitung ulang gaji hari itu (baris lama belum dibayar → aman diganti).
  if (wageBefore) await db.delete(staffDailyWages).where(eq(staffDailyWages.id, wageBefore.id));
  let wageAfter: number | null = null;
  if (checkoutAt) {
    const res = await creditDailyWage({
      staffUserId: emp.staffUserId,
      date,
      attendanceId,
      lateMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      status: metrics.status,
    });
    wageAfter = res.totalCredited;
  }

  const fee: FeeReconcileResult = await reconcileFeeForStaffDay(date, emp.staffUserId);

  // Bulan sudah lewat → bonus kehadiran dicek ulang (hanya menambah bila jadi layak).
  const monthKey = date.slice(0, 7);
  const monthDays = monthDateKeys(monthKey);
  if (monthDays[monthDays.length - 1] < today) {
    await creditMonthlyAttendanceBonus(emp.staffUserId, monthKey);
  }

  await writeAudit(actor, "absen_correction", `absen:${emp.code}:${date}`, {
    reason: input.reason.trim(),
    before: before
      ? {
          checkin: clockWib(before.checkinAt),
          checkout: clockWib(before.checkoutAt),
          lateMinutes: before.lateMinutes,
          status: before.status,
          wage: wageBefore?.totalCredited ?? null,
        }
      : null,
    after: {
      checkin: clockWib(checkinAt),
      checkout: clockWib(checkoutAt),
      lateMinutes,
      status: metrics.status,
      wage: wageAfter,
      fee,
    },
  });

  return { code: emp.code, name: emp.name, date, lateMinutes, status: metrics.status, wage: wageAfter, fee };
}

// ---------------------------------------------------------------------------
// Izin / sakit / cuti
// ---------------------------------------------------------------------------

export interface AddLeaveInput {
  code: string;
  from: string;
  to: string;
  type: LeaveType;
  reason: string;
}

export async function addLeave(input: AddLeaveInput, actor: ControlActor, now = new Date()) {
  const db = getDb();
  const emp = await findEmployee(input.code);
  const today = jakartaDateKey(now);
  const { from, to } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    throw new AbsenControlError("DATE_INVALID", "Rentang tanggal tidak valid.");
  }
  if (daysBetween(from, to) + 1 > LEAVE_MAX_RANGE) {
    throw new AbsenControlError("DATE_INVALID", `Maksimal ${LEAVE_MAX_RANGE} hari sekali catat.`);
  }
  if (daysBetween(from, today) > CORRECTION_MAX_DAYS_BACK || daysBetween(today, to) > LEAVE_MAX_DAYS_AHEAD) {
    throw new AbsenControlError(
      "DATE_INVALID",
      `Izin hanya bisa dicatat ${CORRECTION_MAX_DAYS_BACK} hari ke belakang s/d ${LEAVE_MAX_DAYS_AHEAD} hari ke depan.`,
    );
  }

  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
  const attended = await db
    .select({ date: staffAttendanceV2.date })
    .from(staffAttendanceV2)
    .where(
      and(
        eq(staffAttendanceV2.staffUserId, emp.staffUserId),
        gte(staffAttendanceV2.date, from),
        lte(staffAttendanceV2.date, to),
        isNotNull(staffAttendanceV2.checkinAt),
      ),
    );
  if (attended.length > 0) {
    throw new AbsenControlError(
      "ATTENDANCE_EXISTS",
      `Karyawan sudah absen pada ${attended.map((a) => String(a.date)).join(", ")}. Gunakan koreksi absen untuk tanggal itu.`,
    );
  }

  for (const date of dates) {
    await db
      .insert(staffLeaves)
      .values({
        staffUserId: emp.staffUserId,
        date,
        type: input.type,
        reason: input.reason.trim() || null,
        createdBy: actor.userId,
      })
      .onConflictDoUpdate({
        target: [staffLeaves.staffUserId, staffLeaves.date],
        set: { type: input.type, reason: input.reason.trim() || null, createdBy: actor.userId },
      });
  }

  await writeAudit(actor, "absen_leave_add", `absen:${emp.code}`, {
    type: input.type,
    from,
    to,
    days: dates.length,
    reason: input.reason.trim(),
  });
  return { code: emp.code, name: emp.name, days: dates.length };
}

export async function removeLeave(input: { code: string; date: string }, actor: ControlActor) {
  const emp = await findEmployee(input.code);
  const removed = await getDb()
    .delete(staffLeaves)
    .where(and(eq(staffLeaves.staffUserId, emp.staffUserId), eq(staffLeaves.date, input.date)))
    .returning({ id: staffLeaves.id, type: staffLeaves.type });
  if (removed.length === 0) throw new AbsenControlError("NOT_FOUND", "Izin di tanggal itu tidak ditemukan.");
  await writeAudit(actor, "absen_leave_remove", `absen:${emp.code}:${input.date}`, { type: removed[0].type });
  return { code: emp.code, date: input.date };
}

/** Izin terdaftar di sekitar hari ini (35 hari ke belakang s/d 60 hari ke depan). */
export async function listLeaves(now = new Date()) {
  const today = jakartaDateKey(now);
  const rows = await getDb()
    .select({
      date: staffLeaves.date,
      type: staffLeaves.type,
      reason: staffLeaves.reason,
      code: staffWageConfig.absenCode,
      name: user.name,
    })
    .from(staffLeaves)
    .innerJoin(user, eq(user.id, staffLeaves.staffUserId))
    .innerJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffLeaves.staffUserId))
    .where(
      and(
        gte(staffLeaves.date, addDays(today, -CORRECTION_MAX_DAYS_BACK)),
        lte(staffLeaves.date, addDays(today, LEAVE_MAX_DAYS_AHEAD)),
      ),
    )
    .orderBy(staffLeaves.date);
  return rows.map((r) => ({ ...r, date: String(r.date) }));
}
