// Payroll V2 — service absensi: checkin/checkout dengan validasi PIN + GPS + Selfie.
// Reuse helper existing dari `attendance.ts` (hashPin, pinHashEquals, haversineMeters,
// jakartaDateKey, jakartaMinutesOfDay).
//
// Non-destructive: tidak mengubah tabel/logic `staff_attendance` lama. Semua tulis
// ke `staff_attendance_v2`.

import { promises as fs } from "node:fs";
import path from "node:path";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { staffAttendanceV2, staffProfiles, user } from "@/db/schema";
import {
  hashPin,
  haversineMeters,
  jakartaDateKey,
  jakartaMinutesOfDay,
  pinHashEquals,
} from "@/lib/attendance";
import {
  PAYROLL_KEYS,
  computeLatePercent,
  getPayrollSetting,
} from "@/lib/garage-payroll-settings";

export type AttendanceMethod = "pin" | "pin_selfie_gps" | "pin_selfie_gps_multi";

export interface CheckinInput {
  staffUserId: string;
  pin: string;
  lat?: number | null;
  lng?: number | null;
  selfieBase64?: string | null; // "data:image/jpeg;base64,..."
  device?: string | null;
  now?: Date;
}

export type CheckoutInput = CheckinInput;

export type AttendanceErrorCode =
  | "PIN_INVALID"
  | "PIN_REQUIRED"
  | "OUTSIDE_RADIUS"
  | "GPS_REQUIRED"
  | "SELFIE_REQUIRED"
  | "ALREADY_CHECKED_IN"
  | "NOT_CHECKED_IN"
  | "ALREADY_CHECKED_OUT"
  | "STAFF_NOT_FOUND";

export class AttendanceError extends Error {
  constructor(public code: AttendanceErrorCode, message: string) {
    super(message);
    this.name = "AttendanceError";
  }
}

// ---------- Helper internal ----------

async function loadStaff(staffUserId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      userId: user.id,
      pinHash: staffProfiles.pinHash,
      role: staffProfiles.role,
      status: staffProfiles.status,
    })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(eq(user.id, staffUserId))
    .limit(1);
  if (!row) throw new AttendanceError("STAFF_NOT_FOUND", "Staff tidak ditemukan.");
  return row;
}

function requiredMethodFor(role: string, methodMap: Record<string, string>): AttendanceMethod {
  const m = (methodMap[role] ?? methodMap["default"] ?? "pin_selfie_gps") as AttendanceMethod;
  return m;
}

async function saveSelfie(
  staffUserId: string,
  dateKey: string,
  type: "in" | "out",
  base64: string,
): Promise<string> {
  // base64 = "data:image/jpeg;base64,XXXX" atau raw base64
  const cleaned = base64.includes(",") ? base64.split(",", 2)[1] : base64;
  const buffer = Buffer.from(cleaned, "base64");
  // Validasi magic byte: hanya terima JPEG/PNG asli (anti upload sampah/berbahaya).
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isJpeg && !isPng) {
    throw new AttendanceError("SELFIE_REQUIRED", "Format selfie tidak valid (harus JPEG/PNG).");
  }
  if (buffer.length > 3_000_000) {
    throw new AttendanceError("SELFIE_REQUIRED", "Ukuran selfie melebihi 3MB.");
  }
  // Simpan ke volume persisten `storage/attendance` — DI LUAR public/ sehingga
  // TIDAK di-serve statis. Foto wajah karyawan hanya bisa dibuka lewat API
  // terproteksi /api/attendance-v2/photo (butuh sesi + otorisasi).
  const dir = path.join(process.cwd(), "storage", "attendance", dateKey);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${staffUserId}-${type}.jpg`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/api/attendance-v2/photo/${dateKey}/${filename}`;
}

async function validateGps(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new AttendanceError("GPS_REQUIRED", "Lokasi GPS wajib dikirim.");
  }
  const gps = (await getPayrollSetting(PAYROLL_KEYS.gps)) as {
    lat: number;
    lng: number;
    radiusMeters: number;
  };
  const dist = haversineMeters(lat, lng, gps.lat, gps.lng);
  if (dist > gps.radiusMeters) {
    throw new AttendanceError(
      "OUTSIDE_RADIUS",
      `Anda ${Math.round(dist)}m dari toko (batas ${gps.radiusMeters}m).`,
    );
  }
}

// ---------- API publik ----------

/** Checkin — buat/update row `staff_attendance_v2` untuk hari ini. */
export async function checkinV2(input: CheckinInput) {
  const now = input.now ?? new Date();
  const dateKey = jakartaDateKey(now);

  const staff = await loadStaff(input.staffUserId);
  if (!staff.pinHash) throw new AttendanceError("PIN_REQUIRED", "PIN belum di-set.");
  if (!pinHashEquals(staff.pinHash, hashPin(input.pin || ""))) {
    throw new AttendanceError("PIN_INVALID", "PIN salah.");
  }

  const methods = (await getPayrollSetting(PAYROLL_KEYS.attendanceMethods)) as Record<
    string,
    string
  >;
  const method = requiredMethodFor(staff.role, methods);

  if (method === "pin_selfie_gps" || method === "pin_selfie_gps_multi") {
    if (!input.selfieBase64) throw new AttendanceError("SELFIE_REQUIRED", "Selfie wajib.");
    if (method === "pin_selfie_gps") await validateGps(input.lat, input.lng);
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(staffAttendanceV2)
    .where(and(eq(staffAttendanceV2.staffUserId, input.staffUserId), eq(staffAttendanceV2.date, dateKey)))
    .limit(1);
  if (existing?.checkinAt) {
    throw new AttendanceError("ALREADY_CHECKED_IN", "Anda sudah check-in hari ini.");
  }

  // Hitung telat berdasarkan jam buka
  const general = (await getPayrollSetting(PAYROLL_KEYS.general)) as {
    openHour: number;
  };
  const openMinutes = general.openHour * 60;
  const punchMinutes = jakartaMinutesOfDay(now);
  const lateMinutes = Math.max(0, punchMinutes - openMinutes);

  let selfieUrl: string | null = null;
  if (input.selfieBase64) {
    selfieUrl = await saveSelfie(input.staffUserId, dateKey, "in", input.selfieBase64);
  }

  if (existing) {
    await db
      .update(staffAttendanceV2)
      .set({
        checkinAt: now,
        checkinLat: input.lat ?? null,
        checkinLng: input.lng ?? null,
        checkinSelfieUrl: selfieUrl,
        checkinDevice: input.device ?? null,
        method,
        lateMinutes,
        status: "pending",
        updatedAt: now,
      })
      .where(eq(staffAttendanceV2.id, existing.id));
    return { id: existing.id, dateKey, lateMinutes, method };
  }

  const [created] = await db
    .insert(staffAttendanceV2)
    .values({
      staffUserId: input.staffUserId,
      date: dateKey,
      checkinAt: now,
      checkinLat: input.lat ?? null,
      checkinLng: input.lng ?? null,
      checkinSelfieUrl: selfieUrl,
      checkinDevice: input.device ?? null,
      method,
      lateMinutes,
      status: "pending",
    })
    .returning({ id: staffAttendanceV2.id });

  return { id: created.id, dateKey, lateMinutes, method };
}

/** Checkout — update row hari ini + tandai status valid/invalid. */
export async function checkoutV2(input: CheckoutInput) {
  const now = input.now ?? new Date();
  const dateKey = jakartaDateKey(now);

  const staff = await loadStaff(input.staffUserId);
  if (!staff.pinHash) throw new AttendanceError("PIN_REQUIRED", "PIN belum di-set.");
  if (!pinHashEquals(staff.pinHash, hashPin(input.pin || ""))) {
    throw new AttendanceError("PIN_INVALID", "PIN salah.");
  }

  const methods = (await getPayrollSetting(PAYROLL_KEYS.attendanceMethods)) as Record<
    string,
    string
  >;
  const method = requiredMethodFor(staff.role, methods);
  if (method === "pin_selfie_gps" || method === "pin_selfie_gps_multi") {
    if (!input.selfieBase64) throw new AttendanceError("SELFIE_REQUIRED", "Selfie wajib.");
    if (method === "pin_selfie_gps") await validateGps(input.lat, input.lng);
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(staffAttendanceV2)
    .where(and(eq(staffAttendanceV2.staffUserId, input.staffUserId), eq(staffAttendanceV2.date, dateKey)))
    .limit(1);
  if (!row || !row.checkinAt) {
    throw new AttendanceError("NOT_CHECKED_IN", "Anda belum check-in hari ini.");
  }
  if (row.checkoutAt) {
    throw new AttendanceError("ALREADY_CHECKED_OUT", "Anda sudah check-out hari ini.");
  }

  // Hitung jam kerja + lembur
  const general = (await getPayrollSetting(PAYROLL_KEYS.general)) as {
    closeHour: number;
    minCheckoutHour: number;
    minCheckoutMinute: number;
  };
  const overtime = (await getPayrollSetting(PAYROLL_KEYS.overtime)) as {
    enabled: boolean;
    startHour: number;
    startMinute: number;
    maxHoursPerDay: number;
  };

  const punchMinutes = jakartaMinutesOfDay(now);
  const minCheckoutMinutes = general.minCheckoutHour * 60 + general.minCheckoutMinute;
  const checkinMinutes = jakartaMinutesOfDay(row.checkinAt);
  const workedMinutes = Math.max(0, punchMinutes - checkinMinutes);

  let overtimeMinutes = 0;
  if (overtime.enabled) {
    const otStart = overtime.startHour * 60 + overtime.startMinute;
    if (punchMinutes > otStart) {
      overtimeMinutes = Math.min(punchMinutes - otStart, (overtime.maxHoursPerDay ?? 4) * 60);
    }
  }

  // Status final
  let status: "valid" | "invalid" = "valid";
  if (punchMinutes < minCheckoutMinutes) status = "invalid";

  let selfieUrl: string | null = null;
  if (input.selfieBase64) {
    selfieUrl = await saveSelfie(input.staffUserId, dateKey, "out", input.selfieBase64);
  }

  await db
    .update(staffAttendanceV2)
    .set({
      checkoutAt: now,
      checkoutLat: input.lat ?? null,
      checkoutLng: input.lng ?? null,
      checkoutSelfieUrl: selfieUrl,
      checkoutDevice: input.device ?? null,
      overtimeMinutes,
      workedMinutes,
      status,
      updatedAt: now,
    })
    .where(eq(staffAttendanceV2.id, row.id));

  return { id: row.id, dateKey, status, workedMinutes, overtimeMinutes };
}

/** Ambil attendance hari ini untuk staff. */
export async function getTodayAttendance(staffUserId: string, now = new Date()) {
  const db = getDb();
  const dateKey = jakartaDateKey(now);
  const [row] = await db
    .select()
    .from(staffAttendanceV2)
    .where(and(eq(staffAttendanceV2.staffUserId, staffUserId), eq(staffAttendanceV2.date, dateKey)))
    .limit(1);
  return row ?? null;
}

/** Ambil histori attendance bulan tertentu (YYYY-MM). */
export async function getMonthAttendance(staffUserId: string, monthKey: string) {
  const db = getDb();
  const [yyyy, mm] = monthKey.split("-");
  const start = `${yyyy}-${mm}-01`;
  const endMonth = Number(mm) === 12 ? 1 : Number(mm) + 1;
  const endYear = Number(mm) === 12 ? Number(yyyy) + 1 : Number(yyyy);
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  return db
    .select()
    .from(staffAttendanceV2)
    .where(
      and(
        eq(staffAttendanceV2.staffUserId, staffUserId),
        gte(staffAttendanceV2.date, start),
        lte(staffAttendanceV2.date, end),
      ),
    )
    .orderBy(desc(staffAttendanceV2.date));
}

/** Utility yang dipakai oleh cron & wage service. */
export function bracketMultiplierPercent(
  lateMinutes: number,
  brackets: Array<{ maxMinutes: number | null; percent: number }>,
): number {
  return computeLatePercent(lateMinutes, brackets);
}
