// =============================================================================
// Profil karyawan 360°: identitas + data pribadi + absensi + gaji/fee + dokumen
// + aktivitas, untuk Owner/Manajer (izin staff:manage). NIK & rekening bank
// hanya tampil penuh untuk Owner; Manajer melihat versi tersamar dan tidak bisa
// mengubahnya. Manajer hanya bisa membuka staf di outlet-nya dengan level di
// bawahnya (aturan sama dengan /api/hr/team/staff).
// =============================================================================

import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  auditLogs,
  candidates,
  feePoolSplits,
  shiftSchedules,
  staffAttendanceV2,
  staffCashAdvances,
  staffDailyWages,
  staffLeaves,
  staffPayrollPayments,
  staffPersonal,
  staffProfiles,
  staffWageConfig,
  user,
} from "@/db/schema";
import type { Role } from "@/lib/garage-data";
import { protectedRoleRank } from "@/lib/role-access";
import type { GarageSession } from "@/lib/server-auth";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

export class StaffProfileError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "StaffProfileError";
  }
}

export const CONTRACT_TYPES = ["tetap", "kontrak", "harian", "magang"] as const;
export const STAFF_DOC_KINDS = ["photo", "ktp", "cv", "contract", "other"] as const;
export type StaffDocKind = (typeof STAFF_DOC_KINDS)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value ? value : null));
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal format YYYY-MM-DD.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const staffPersonalSchema = z.object({
  whatsapp: optionalText(20).refine((v) => !v || normalizeWaNumber(v) !== "", "Nomor WhatsApp tidak valid."),
  address: optionalText(300),
  birthDate: optionalDate,
  gender: z.enum(["Laki-laki", "Perempuan"]).nullable().optional(),
  nik: optionalText(16).refine((v) => !v || /^\d{16}$/.test(v), "NIK harus 16 digit angka."),
  bankName: optionalText(40),
  bankAccountNumber: optionalText(30).refine((v) => !v || /^[0-9 -]{5,30}$/.test(v), "Nomor rekening hanya angka."),
  bankAccountName: optionalText(80),
  emergencyName: optionalText(80),
  emergencyRelation: optionalText(40),
  emergencyPhone: optionalText(20).refine((v) => !v || normalizeWaNumber(v) !== "", "Nomor kontak darurat tidak valid."),
  contractType: z.enum(CONTRACT_TYPES).nullable().optional(),
  contractEnd: optionalDate,
  notes: optionalText(1000),
});
export type StaffPersonalInput = Partial<z.infer<typeof staffPersonalSchema>>;

const OWNER_ONLY_FIELDS = ["nik", "bankName", "bankAccountNumber", "bankAccountName"] as const;

/** "3201234567890012" → "3201••••••••0012". */
export function maskSensitive(value: string | null | undefined, keepStart = 4, keepEnd = 4): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= keepStart + keepEnd) return "•".repeat(clean.length);
  return `${clean.slice(0, keepStart)}${"•".repeat(clean.length - keepStart - keepEnd)}${clean.slice(-keepEnd)}`;
}

function jakartaParts(now: Date) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  return { today: key, month: key.slice(0, 7) };
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lama kerja "1 th 3 bln" dari tanggal masuk. */
export function tenureLabel(joinDate: string | null, today: string): string | null {
  if (!joinDate) return null;
  const [y1, m1, d1] = joinDate.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return null;
  if (months === 0) return "< 1 bln";
  const years = Math.floor(months / 12);
  months %= 12;
  return [years ? `${years} th` : "", months ? `${months} bln` : ""].filter(Boolean).join(" ");
}

type TargetRow = {
  id: string;
  userId: string;
  outletId: string;
  role: string;
  name: string;
};

async function loadTarget(staffProfileId: string): Promise<TargetRow> {
  const [row] = await getDb()
    .select({
      id: staffProfiles.id,
      userId: staffProfiles.userId,
      outletId: staffProfiles.outletId,
      role: staffProfiles.role,
      name: user.name,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(eq(staffProfiles.id, staffProfileId))
    .limit(1);
  if (!row) throw new StaffProfileError(404, "STAFF_NOT_FOUND", "Profil karyawan tidak ditemukan.");
  return row;
}

/** Owner: semua. Selain Owner: hanya outlet sendiri & level di bawahnya (atau diri sendiri). */
export function assertCanAccessStaff(session: GarageSession, target: Pick<TargetRow, "id" | "outletId" | "role">) {
  const actorRole = session.profile.role as Role;
  if (actorRole === "Owner") return;
  if (target.id === session.profile.id) return;
  if (target.outletId !== session.profile.outlet.id) {
    throw new StaffProfileError(403, "FORBIDDEN", "Karyawan ini bukan dari outlet anda.");
  }
  const targetRank = protectedRoleRank[target.role as Role] ?? 0;
  if (targetRank >= protectedRoleRank[actorRole]) {
    throw new StaffProfileError(403, "FORBIDDEN", "Role anda tidak boleh membuka profil dengan level akses ini.");
  }
}

/** Muat karyawan & pastikan sesi boleh mengaksesnya (dipakai sebelum simpan file). */
export async function assertStaffAccessById(staffProfileId: string, session: GarageSession) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  return target;
}

export async function getStaffProfile360(staffProfileId: string, session: GarageSession, now = new Date()) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  const isOwner = session.profile.role === "Owner";
  const db = getDb();
  const { today, month } = jakartaParts(now);
  const range = monthRange(month);
  const userId = target.userId;

  const [
    [base],
    [personal],
    attendance,
    leaves,
    shifts,
    [wageAgg],
    [feeAgg],
    payments,
    advances,
  ] = await Promise.all([
    db
      .select({
        name: user.name,
        email: user.email,
        image: user.image,
        role: staffProfiles.role,
        division: staffProfiles.division,
        position: staffProfiles.position,
        status: staffProfiles.status,
        suspendedAt: staffProfiles.suspendedAt,
        suspendedReason: staffProfiles.suspendedReason,
        shiftLabel: staffProfiles.shiftLabel,
        workstation: staffProfiles.workstation,
        lastLoginAt: staffProfiles.lastLoginAt,
        createdAt: staffProfiles.createdAt,
        absenCode: staffWageConfig.absenCode,
        monthlySalary: staffWageConfig.monthlySalary,
        dailyWage: staffWageConfig.dailyWage,
        overtimeHourly: staffWageConfig.overtimeHourly,
        monthlyDeduction: staffWageConfig.monthlyDeduction,
        excludeFromFee: staffWageConfig.excludeFromFee,
        shiftStartMinutes: staffWageConfig.shiftStartMinutes,
        joinDate: staffWageConfig.joinDate,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(user.id, staffProfiles.userId))
      .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, staffProfiles.userId))
      .where(eq(staffProfiles.id, staffProfileId))
      .limit(1),
    db.select().from(staffPersonal).where(eq(staffPersonal.staffProfileId, staffProfileId)).limit(1),
    db
      .select({
        date: staffAttendanceV2.date,
        checkinAt: staffAttendanceV2.checkinAt,
        checkoutAt: staffAttendanceV2.checkoutAt,
        lateMinutes: staffAttendanceV2.lateMinutes,
        overtimeMinutes: staffAttendanceV2.overtimeMinutes,
        workedMinutes: staffAttendanceV2.workedMinutes,
        status: staffAttendanceV2.status,
      })
      .from(staffAttendanceV2)
      .where(
        and(
          eq(staffAttendanceV2.staffUserId, userId),
          gte(staffAttendanceV2.date, range.start),
          lt(staffAttendanceV2.date, range.end),
        ),
      )
      .orderBy(desc(staffAttendanceV2.date)),
    db
      .select({ date: staffLeaves.date, type: staffLeaves.type, reason: staffLeaves.reason })
      .from(staffLeaves)
      .where(and(eq(staffLeaves.staffUserId, userId), gte(staffLeaves.date, range.start), lt(staffLeaves.date, range.end)))
      .orderBy(desc(staffLeaves.date)),
    db
      .select({
        date: shiftSchedules.date,
        shiftType: shiftSchedules.shiftType,
        startTime: shiftSchedules.startTime,
        endTime: shiftSchedules.endTime,
      })
      .from(shiftSchedules)
      .where(
        and(
          eq(shiftSchedules.staffId, staffProfileId),
          gte(shiftSchedules.date, today),
          lt(shiftSchedules.date, addDays(today, 7)),
        ),
      )
      .orderBy(shiftSchedules.date),
    db
      .select({ balance: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)` })
      .from(staffDailyWages)
      .where(and(eq(staffDailyWages.staffUserId, userId), isNull(staffDailyWages.payoutId))),
    db
      .select({
        balance: sql<number>`COALESCE(SUM(${feePoolSplits.amount} + ${feePoolSplits.bonusTarget} + ${feePoolSplits.bonusZeroKomplain}), 0)`,
      })
      .from(feePoolSplits)
      .where(and(eq(feePoolSplits.staffUserId, userId), isNull(feePoolSplits.paymentId))),
    db
      .select({
        id: staffPayrollPayments.id,
        paidUntil: staffPayrollPayments.paidUntil,
        grossGaji: staffPayrollPayments.grossGaji,
        grossFee: staffPayrollPayments.grossFee,
        advanceDeducted: staffPayrollPayments.advanceDeducted,
        netPaid: staffPayrollPayments.netPaid,
        method: staffPayrollPayments.method,
        status: staffPayrollPayments.status,
        createdAt: staffPayrollPayments.createdAt,
      })
      .from(staffPayrollPayments)
      .where(eq(staffPayrollPayments.staffUserId, userId))
      .orderBy(desc(staffPayrollPayments.createdAt))
      .limit(6),
    db
      .select({
        id: staffCashAdvances.id,
        date: staffCashAdvances.date,
        amount: staffCashAdvances.amount,
        settledAmount: staffCashAdvances.settledAmount,
        note: staffCashAdvances.note,
        status: staffCashAdvances.status,
      })
      .from(staffCashAdvances)
      .where(eq(staffCashAdvances.staffUserId, userId))
      .orderBy(desc(staffCashAdvances.createdAt))
      .limit(10),
  ]);
  if (!base) throw new StaffProfileError(404, "STAFF_NOT_FOUND", "Profil karyawan tidak ditemukan.");

  const objectKeys = [`staff:${staffProfileId}`, ...(base.absenCode ? [`absen:${base.absenCode}`] : [])];
  const audit = await db
    .select({
      id: auditLogs.id,
      time: auditLogs.time,
      actor: auditLogs.actor,
      action: auditLogs.action,
      object: auditLogs.object,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      or(
        sql`${auditLogs.object} IN (${sql.join(objectKeys.map((k) => sql`${k}`), sql`, `)})`,
        sql`${auditLogs.actor} LIKE ${`${base.name} /%`}`,
        sql`${auditLogs.metadata}->>'staffProfileId' = ${staffProfileId}`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  const joinDate = base.joinDate ? String(base.joinDate) : null;
  const summary = {
    hadir: attendance.filter((a) => a.checkinAt).length,
    telat: attendance.filter((a) => a.lateMinutes > 0).length,
    lateMinutes: attendance.reduce((sum, a) => sum + a.lateMinutes, 0),
    overtimeMinutes: attendance.reduce((sum, a) => sum + a.overtimeMinutes, 0),
    workedMinutes: attendance.reduce((sum, a) => sum + a.workedMinutes, 0),
    absent: attendance.filter((a) => a.status === "absent").length,
    izin: leaves.filter((l) => l.type === "izin").length,
    sakit: leaves.filter((l) => l.type === "sakit").length,
    cuti: leaves.filter((l) => l.type === "cuti").length,
  };
  const outstandingAdvance = advances
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + Math.max(0, a.amount - a.settledAmount), 0);

  const p = personal ?? null;
  const restricted = !isOwner;
  return {
    id: staffProfileId,
    userId,
    canSeeSensitive: isOwner,
    canEditSensitive: isOwner,
    identity: {
      name: base.name,
      email: base.email.endsWith("@absen.garage.local") ? null : base.email,
      role: base.role,
      division: base.division,
      position: base.position,
      status: base.status,
      suspendedAt: base.suspendedAt?.toISOString() ?? null,
      suspendedReason: base.suspendedReason,
      shiftLabel: base.shiftLabel,
      workstation: base.workstation,
      lastLoginAt: base.lastLoginAt?.toISOString() ?? null,
      createdAt: base.createdAt.toISOString(),
      absenCode: base.absenCode ?? null,
      joinDate,
      tenure: tenureLabel(joinDate ?? base.createdAt.toISOString().slice(0, 10), today),
      photoUrl: p?.photoUrl ?? base.image ?? null,
    },
    personal: {
      whatsapp: p?.whatsapp ?? null,
      address: p?.address ?? null,
      birthDate: p?.birthDate ? String(p.birthDate) : null,
      gender: p?.gender ?? null,
      nik: restricted ? maskSensitive(p?.nik) : (p?.nik ?? null),
      bankName: p?.bankName ?? null,
      bankAccountNumber: restricted ? maskSensitive(p?.bankAccountNumber, 0, 4) : (p?.bankAccountNumber ?? null),
      bankAccountName: p?.bankAccountName ?? null,
      emergencyName: p?.emergencyName ?? null,
      emergencyRelation: p?.emergencyRelation ?? null,
      emergencyPhone: p?.emergencyPhone ?? null,
      contractType: p?.contractType ?? null,
      contractEnd: p?.contractEnd ? String(p.contractEnd) : null,
      notes: p?.notes ?? null,
      updatedAt: p?.updatedAt?.toISOString() ?? null,
    },
    documents: {
      photoUrl: p?.photoUrl ?? null,
      // File KTP hanya untuk Owner (data identitas).
      ktpUrl: restricted ? null : (p?.ktpUrl ?? null),
      hasKtp: Boolean(p?.ktpUrl),
      cvUrl: p?.cvUrl ?? null,
      contractUrl: p?.contractUrl ?? null,
      otherDocs: p?.otherDocs ?? [],
    },
    pay: {
      monthlySalary: base.monthlySalary ?? null,
      dailyWage: base.dailyWage ?? null,
      overtimeHourly: base.overtimeHourly ?? null,
      monthlyDeduction: base.monthlyDeduction ?? 0,
      excludeFromFee: base.excludeFromFee ?? false,
      walletGaji: Number(wageAgg?.balance ?? 0),
      walletFee: Number(feeAgg?.balance ?? 0),
      outstandingAdvance,
      payments: payments.map((row) => ({
        ...row,
        paidUntil: String(row.paidUntil),
        createdAt: row.createdAt.toISOString(),
      })),
      advances: advances.map((row) => ({ ...row, date: String(row.date) })),
    },
    attendance: {
      month,
      summary,
      days: attendance.map((row) => ({
        date: String(row.date),
        checkinAt: row.checkinAt?.toISOString() ?? null,
        checkoutAt: row.checkoutAt?.toISOString() ?? null,
        lateMinutes: row.lateMinutes,
        overtimeMinutes: row.overtimeMinutes,
        workedMinutes: row.workedMinutes,
        status: row.status,
      })),
      leaves: leaves.map((row) => ({ ...row, date: String(row.date) })),
      upcomingShifts: shifts.map((row) => ({ ...row, date: String(row.date) })),
    },
    activity: audit.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}

export type StaffProfile360 = Awaited<ReturnType<typeof getStaffProfile360>>;

async function writeStaffAudit(session: GarageSession, staffProfileId: string, name: string, action: string, metadata: Record<string, unknown>) {
  try {
    await getDb().insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: `${session.user.name} / ${session.profile.role}`,
      action,
      object: `staff:${staffProfileId}`,
      device: session.profile.deviceLabel ?? "OS",
      status: "recorded",
      metadata: { staffProfileId, name, ...metadata },
    });
  } catch {
    /* audit non-blocking */
  }
}

export async function updateStaffPersonal(staffProfileId: string, input: StaffPersonalInput, session: GarageSession) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  const isOwner = session.profile.role === "Owner";
  const changed = Object.entries(input).filter(([, value]) => value !== undefined).map(([key]) => key);
  if (!isOwner && changed.some((key) => (OWNER_ONLY_FIELDS as readonly string[]).includes(key))) {
    throw new StaffProfileError(403, "OWNER_ONLY_FIELD", "NIK dan rekening bank hanya bisa diubah Owner.");
  }
  if (changed.length === 0) return { updated: [] as string[] };

  const values: Partial<typeof staffPersonal.$inferInsert> = {};
  for (const key of changed) {
    const raw = input[key as keyof StaffPersonalInput];
    (values as Record<string, unknown>)[key] =
      (key === "whatsapp" || key === "emergencyPhone") && typeof raw === "string" ? normalizeWaNumber(raw) : raw;
  }
  values.updatedAt = new Date();
  values.updatedBy = session.user.id;
  await getDb()
    .insert(staffPersonal)
    .values({ staffProfileId, ...values })
    .onConflictDoUpdate({ target: staffPersonal.staffProfileId, set: values });

  // Nilai NIK/rekening tidak ditulis ke audit — cukup nama kolomnya.
  await writeStaffAudit(session, staffProfileId, target.name, "Profil karyawan: data diri diubah", { fields: changed });
  return { updated: changed };
}

const DOC_COLUMN: Record<Exclude<StaffDocKind, "other">, "photoUrl" | "ktpUrl" | "cvUrl" | "contractUrl"> = {
  photo: "photoUrl",
  ktp: "ktpUrl",
  cv: "cvUrl",
  contract: "contractUrl",
};

export async function attachStaffDocument(
  staffProfileId: string,
  kind: StaffDocKind,
  url: string,
  label: string | null,
  session: GarageSession,
) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  if (kind === "ktp" && session.profile.role !== "Owner") {
    throw new StaffProfileError(403, "OWNER_ONLY_FIELD", "File KTP hanya bisa diunggah Owner.");
  }
  const db = getDb();
  const now = new Date();
  if (kind === "other") {
    const [existing] = await db
      .select({ otherDocs: staffPersonal.otherDocs })
      .from(staffPersonal)
      .where(eq(staffPersonal.staffProfileId, staffProfileId))
      .limit(1);
    const docs = [...(existing?.otherDocs ?? []), { label: label?.trim() || "Dokumen", url }].slice(-20);
    await db
      .insert(staffPersonal)
      .values({ staffProfileId, otherDocs: docs, updatedAt: now, updatedBy: session.user.id })
      .onConflictDoUpdate({ target: staffPersonal.staffProfileId, set: { otherDocs: docs, updatedAt: now, updatedBy: session.user.id } });
  } else {
    const column = DOC_COLUMN[kind];
    await db
      .insert(staffPersonal)
      .values({ staffProfileId, [column]: url, updatedAt: now, updatedBy: session.user.id })
      .onConflictDoUpdate({ target: staffPersonal.staffProfileId, set: { [column]: url, updatedAt: now, updatedBy: session.user.id } });
  }
  await writeStaffAudit(session, staffProfileId, target.name, "Profil karyawan: dokumen diunggah", { kind, label });
  return { kind, url };
}

export async function removeStaffDocument(staffProfileId: string, kind: StaffDocKind, url: string | null, session: GarageSession) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  if (kind === "ktp" && session.profile.role !== "Owner") {
    throw new StaffProfileError(403, "OWNER_ONLY_FIELD", "File KTP hanya bisa dihapus Owner.");
  }
  const db = getDb();
  const now = new Date();
  if (kind === "other") {
    const [existing] = await db
      .select({ otherDocs: staffPersonal.otherDocs })
      .from(staffPersonal)
      .where(eq(staffPersonal.staffProfileId, staffProfileId))
      .limit(1);
    const docs = (existing?.otherDocs ?? []).filter((doc) => doc.url !== url);
    await db
      .update(staffPersonal)
      .set({ otherDocs: docs, updatedAt: now, updatedBy: session.user.id })
      .where(eq(staffPersonal.staffProfileId, staffProfileId));
  } else {
    await db
      .update(staffPersonal)
      .set({ [DOC_COLUMN[kind]]: null, updatedAt: now, updatedBy: session.user.id })
      .where(eq(staffPersonal.staffProfileId, staffProfileId));
  }
  await writeStaffAudit(session, staffProfileId, target.name, "Profil karyawan: dokumen dihapus", { kind });
  return { kind };
}

/** Akses baca file dokumen: sama dengan profil, dan KTP hanya Owner. */
export async function assertCanReadStaffFile(staffProfileId: string, fileName: string, session: GarageSession) {
  const target = await loadTarget(staffProfileId);
  assertCanAccessStaff(session, target);
  if (session.profile.role === "Owner") return;
  const [row] = await getDb()
    .select({ ktpUrl: staffPersonal.ktpUrl })
    .from(staffPersonal)
    .where(eq(staffPersonal.staffProfileId, staffProfileId))
    .limit(1);
  if (row?.ktpUrl?.endsWith(`/${fileName}`)) {
    throw new StaffProfileError(403, "OWNER_ONLY_FIELD", "File KTP hanya bisa dibuka Owner.");
  }
}

/**
 * Salin data pelamar ke data diri karyawan (dipanggil saat "Jadikan Karyawan"
 * dan backfill). Hanya mengisi kolom yang masih kosong — tidak menimpa editan.
 */
export async function copyCandidateToStaffPersonal(candidateId: string, absenCode: string) {
  const db = getDb();
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!candidate) return null;
  const [staff] = await db
    .select({ id: staffProfiles.id })
    .from(staffWageConfig)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(eq(staffWageConfig.absenCode, absenCode))
    .limit(1);
  if (!staff) return null;
  const [existing] = await db.select().from(staffPersonal).where(eq(staffPersonal.staffProfileId, staff.id)).limit(1);
  const gender = candidate.gender === "Laki-laki" || candidate.gender === "Perempuan" ? candidate.gender : null;
  const fill = {
    whatsapp: existing?.whatsapp ?? (normalizeWaNumber(candidate.whatsapp) || null),
    address: existing?.address ?? candidate.domicile ?? null,
    birthDate: existing?.birthDate ?? candidate.birthDate ?? null,
    gender: existing?.gender ?? gender,
    photoUrl: existing?.photoUrl ?? candidate.photoUrl ?? null,
    ktpUrl: existing?.ktpUrl ?? candidate.ktpUrl ?? null,
    cvUrl: existing?.cvUrl ?? candidate.cvUrl ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(staffPersonal)
    .values({ staffProfileId: staff.id, ...fill })
    .onConflictDoUpdate({ target: staffPersonal.staffProfileId, set: fill });
  return staff.id;
}
