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
import { staffAttendanceV2, staffProfiles, staffWageConfig, user } from "@/db/schema";
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
  // Paksa metode tertentu (jalur absen payroll /api/absen). Kosong = ikut peta per-role.
  method?: AttendanceMethod;
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

const METHOD_STRICTNESS: Record<AttendanceMethod, number> = {
  pin: 0,
  pin_selfie_gps_multi: 1,
  pin_selfie_gps: 2,
};

function asMethod(value: string | undefined): AttendanceMethod | null {
  return value && value in METHOD_STRICTNESS ? (value as AttendanceMethod) : null;
}

/**
 * Metode absen jalur sesi login. Satu akun = login = absen, jadi jalur ini
 * TIDAK boleh lebih longgar dari /absen (`methods.absen`, default PIN + selfie
 * + GPS): diambil yang paling ketat antara metode role dan metode /absen.
 */
export function requiredMethodFor(role: string, methodMap: Record<string, string> | null): AttendanceMethod {
  const map = methodMap ?? {};
  const roleMethod = asMethod(map[role]) ?? asMethod(map["default"]) ?? "pin_selfie_gps";
  const absenMethod = asMethod(map["absen"]) ?? "pin_selfie_gps";
  return METHOD_STRICTNESS[roleMethod] >= METHOD_STRICTNESS[absenMethod] ? roleMethod : absenMethod;
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

const NIGHT_SHIFT_FROM = 12 * 60; // shift mulai >= 12:00 = shift malam (lintas tengah malam)
export const OPEN_SHIFT_MAX_MS = 20 * 60 * 60 * 1000; // shift terbuka maks 20 jam

function previousDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function loadShiftStartMinutes(staffUserId: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ shiftStartMinutes: staffWageConfig.shiftStartMinutes })
    .from(staffWageConfig)
    .where(eq(staffWageConfig.staffUserId, staffUserId))
    .limit(1);
  return row?.shiftStartMinutes ?? null;
}

const dayStartMs = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`).getTime();

/** Jam masuk efektif (menit sejak 00:00): shift pribadi atau jam buka toko. */
export async function resolveShiftStart(staffUserId: string) {
  const general = (await getPayrollSetting(PAYROLL_KEYS.general)) as { openHour: number };
  const shiftStart = await loadShiftStartMinutes(staffUserId);
  return { shiftStart, openMinutes: shiftStart ?? general.openHour * 60 };
}

/** Menit telat = selisih check-in dengan jam masuk pada tanggal shift (dibulatkan ke bawah). */
export function lateMinutesFor(dateKey: string, openMinutes: number, checkinAt: Date): number {
  const startMs = dayStartMs(dateKey) + openMinutes * 60_000;
  return Math.max(0, Math.floor((checkinAt.getTime() - startMs) / 60_000));
}

/**
 * Tanggal shift untuk sebuah check-in: shift malam (mulai >= 12:00) yang
 * check-in lewat tengah malam milik shift tanggal kemarin.
 */
export function shiftDateForCheckin(openMinutes: number, checkinAt: Date): string {
  const dateKey = jakartaDateKey(checkinAt);
  return openMinutes >= NIGHT_SHIFT_FROM && jakartaMinutesOfDay(checkinAt) < NIGHT_SHIFT_FROM
    ? previousDateKey(dateKey)
    : dateKey;
}

/** Jam kerja, lembur, dan status saat shift `dateKey` ditutup pada `checkoutAt`. */
export async function checkoutMetrics(
  staffUserId: string,
  dateKey: string,
  checkinAt: Date,
  checkoutAt: Date,
) {
  const shiftStart = await loadShiftStartMinutes(staffUserId);
  const general = (await getPayrollSetting(PAYROLL_KEYS.general)) as {
    minCheckoutHour: number;
    minCheckoutMinute: number;
    requireMinCheckout?: boolean; // default true. false = tak ada syarat jam pulang (Garage)
  };
  const overtime = (await getPayrollSetting(PAYROLL_KEYS.overtime)) as {
    enabled: boolean;
    startHour: number;
    startMinute: number;
    maxHoursPerDay: number;
  };

  // Menit checkout relatif ke 00:00 tanggal shift (lewat tengah malam = > 1440).
  const punchMinutes = Math.floor((checkoutAt.getTime() - dayStartMs(dateKey)) / 60_000);
  const workedMinutes = Math.max(0, Math.round((checkoutAt.getTime() - checkinAt.getTime()) / 60_000));

  // Lembur = lewat jam tutup, hanya untuk karyawan jam normal (shift khusus
  // seperti jaga malam memang bekerja lewat tengah malam).
  let overtimeMinutes = 0;
  if (overtime.enabled && shiftStart === null) {
    const otStart = overtime.startHour * 60 + overtime.startMinute;
    if (punchMinutes > otStart) {
      overtimeMinutes = Math.min(punchMinutes - otStart, (overtime.maxHoursPerDay ?? 4) * 60);
    }
  }

  // Bila requireMinCheckout=false, valid asal check-in + check-out ada
  // (potongan hanya dari telat, bukan pulang cepat).
  const requireMinCheckout = general.requireMinCheckout !== false && shiftStart === null;
  const minCheckoutMinutes = general.minCheckoutHour * 60 + general.minCheckoutMinute;
  const status: "valid" | "invalid" =
    requireMinCheckout && punchMinutes < minCheckoutMinutes ? "invalid" : "valid";

  return { workedMinutes, overtimeMinutes, status };
}

/**
 * Shift yang sedang berjalan: baris hari ini, atau baris kemarin yang sudah
 * check-in tapi belum check-out (shift malam / lembur lewat tengah malam).
 */
export async function getCurrentAttendance(staffUserId: string, now = new Date()) {
  const today = await getTodayAttendance(staffUserId, now);
  if (today) return today;
  return findOpenPreviousShift(staffUserId, now);
}

/** Shift tanggal kemarin yang sudah check-in, belum check-out, dan belum > 20 jam. */
async function findOpenPreviousShift(staffUserId: string, now: Date) {
  const [prev] = await getDb()
    .select()
    .from(staffAttendanceV2)
    .where(
      and(
        eq(staffAttendanceV2.staffUserId, staffUserId),
        eq(staffAttendanceV2.date, previousDateKey(jakartaDateKey(now))),
      ),
    )
    .limit(1);
  const isOpen =
    prev?.checkinAt &&
    !prev.checkoutAt &&
    now.getTime() - prev.checkinAt.getTime() <= OPEN_SHIFT_MAX_MS;
  return isOpen ? prev : null;
}

/** Checkin — buat/update row `staff_attendance_v2` untuk tanggal shift. */
export async function checkinV2(input: CheckinInput) {
  const now = input.now ?? new Date();

  const staff = await loadStaff(input.staffUserId);
  if (!staff.pinHash) throw new AttendanceError("PIN_REQUIRED", "PIN belum di-set.");
  if (!pinHashEquals(staff.pinHash, hashPin(input.pin || ""))) {
    throw new AttendanceError("PIN_INVALID", "PIN salah.");
  }

  const methods = (await getPayrollSetting(PAYROLL_KEYS.attendanceMethods)) as Record<
    string,
    string
  >;
  const method = input.method ?? requiredMethodFor(staff.role, methods);

  if (method === "pin_selfie_gps" || method === "pin_selfie_gps_multi") {
    if (!input.selfieBase64) throw new AttendanceError("SELFIE_REQUIRED", "Selfie wajib.");
    if (method === "pin_selfie_gps") await validateGps(input.lat, input.lng);
  }

  const db = getDb();

  // Hitung telat terhadap jam masuk shift pribadi (bila ada) atau jam buka toko.
  const { openMinutes } = await resolveShiftStart(input.staffUserId);
  const dateKey = shiftDateForCheckin(openMinutes, now);
  const lateMinutes = lateMinutesFor(dateKey, openMinutes, now);

  const [existing] = await db
    .select()
    .from(staffAttendanceV2)
    .where(and(eq(staffAttendanceV2.staffUserId, input.staffUserId), eq(staffAttendanceV2.date, dateKey)))
    .limit(1);
  if (existing?.checkinAt) {
    throw new AttendanceError("ALREADY_CHECKED_IN", "Anda sudah check-in untuk shift ini.");
  }

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

/** Checkout — tutup shift yang sedang berjalan + tandai status valid/invalid. */
export async function checkoutV2(input: CheckoutInput) {
  const now = input.now ?? new Date();

  const staff = await loadStaff(input.staffUserId);
  if (!staff.pinHash) throw new AttendanceError("PIN_REQUIRED", "PIN belum di-set.");
  if (!pinHashEquals(staff.pinHash, hashPin(input.pin || ""))) {
    throw new AttendanceError("PIN_INVALID", "PIN salah.");
  }

  const methods = (await getPayrollSetting(PAYROLL_KEYS.attendanceMethods)) as Record<
    string,
    string
  >;
  const method = input.method ?? requiredMethodFor(staff.role, methods);
  if (method === "pin_selfie_gps" || method === "pin_selfie_gps_multi") {
    if (!input.selfieBase64) throw new AttendanceError("SELFIE_REQUIRED", "Selfie wajib.");
    if (method === "pin_selfie_gps") await validateGps(input.lat, input.lng);
  }

  const db = getDb();
  // Shift hari ini yang masih terbuka; kalau tidak ada, shift kemarin yang belum
  // ditutup (shift malam / lembur lewat tengah malam).
  const today = await getTodayAttendance(input.staffUserId, now);
  const row =
    today?.checkinAt && !today.checkoutAt
      ? today
      : ((await findOpenPreviousShift(input.staffUserId, now)) ?? today);
  if (!row || !row.checkinAt) {
    throw new AttendanceError("NOT_CHECKED_IN", "Anda belum check-in.");
  }
  if (row.checkoutAt) {
    throw new AttendanceError("ALREADY_CHECKED_OUT", "Anda sudah check-out untuk shift ini.");
  }
  const dateKey = String(row.date);
  const { workedMinutes, overtimeMinutes, status } = await checkoutMetrics(
    input.staffUserId,
    dateKey,
    row.checkinAt,
    now,
  );

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
