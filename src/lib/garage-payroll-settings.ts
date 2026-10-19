// Payroll V2 — pengaturan key-value JSON dengan cache in-memory (60 detik).
// Zero hardcode: semua aturan (koordinat GPS, upah default, bracket telat, fee/produk, dst)
// tersimpan di tabel `payroll_settings` dan bisa di-atur owner dari UI.
//
// Feature-flagged via env PAYROLL_V2_ENABLED (default false).

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { payrollSettings } from "@/db/schema";
import { GARAGE_LOCATION } from "@/lib/garage-location";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

// ---------- Kunci settings & bentuk default ----------

export const PAYROLL_KEYS = {
  general: "general", // { openHour, closeHour, minCheckoutHour }
  gps: "gps", // { lat, lng, radiusMeters }
  attendanceMethods: "attendance.methods", // per role: pin | pin_selfie_gps | pin_selfie_gps_multi
  lateBrackets: "late.brackets", // [{ maxMinutes, percent }]
  overtime: "overtime", // { enabled, startHour, hourlyRate, autoFromWage, holidayMultiplier }
  feePool: "fee.pool", // { enabled, perProduct, splitMode, fallbackMode, minMinutes, excludePromo, includeRoles, excludeRoles }
  bonusTarget: "bonus.target", // { enabled, dailyOrderThreshold, amountPerStaff }
  bonusZeroKomplain: "bonus.zeroKomplain", // { enabled, amountPerStaff }
  bonusAttendance: "bonus.attendance", // { enabled, amount, allowLateOnce }
  payout: "payout", // { mode: manual|auto, autoDay, minBalance, cutoffHour }
  slip: "slip", // { headerNote, footerNote, includeSignature }
  security: "security", // { pinLength, maxPinAttempts, lockMinutes, photoRetentionDays }
  umk: "umk", // { amount, region, year } — upah minimum yang berlaku (diisi Owner)
  backup: "backup", // { copyToDir } — folder salinan backup di luar laptop (Drive/flashdisk)
} as const;

export type PayrollKey = (typeof PAYROLL_KEYS)[keyof typeof PAYROLL_KEYS];

// Peran yang TIDAK ikut fee pool (Owner & Manajer).
export const MANAGER_ROLES = new Set<string>(MANAGEMENT_ROLES);

// Default settings — dipakai kalau row belum ada di DB. Sinkron dengan design doc.
export const PAYROLL_DEFAULTS: Record<string, unknown> = {
  [PAYROLL_KEYS.general]: {
    openHour: 9,
    closeHour: 23,
    minCheckoutHour: 22, // checkout harus ≥ 22:30 utk valid; menit di config lain
    minCheckoutMinute: 30,
    weeklyOffDays: [1], // 1 = Senin (0=Minggu). Kosongkan array bila tidak ada libur mingguan
    timezone: "Asia/Jakarta",
  },
  [PAYROLL_KEYS.gps]: {
    lat: GARAGE_LOCATION.lat, // titik resmi Google Maps; owner tetap bisa ubah dari UI
    lng: GARAGE_LOCATION.lng,
    radiusMeters: 50,
  },
  [PAYROLL_KEYS.attendanceMethods]: {
    // per role name; fallback "default"
    // Satu akun = login = absen: semua staf PIN + selfie + GPS (sama dengan
    // /absen). Jalur sesi login tidak pernah lebih longgar dari `absen`.
    default: "pin_selfie_gps",
    absen: "pin_selfie_gps",
  },
  [PAYROLL_KEYS.lateBrackets]: [
    { maxMinutes: 15, percent: 100 },
    { maxMinutes: 60, percent: 75 },
    { maxMinutes: 120, percent: 50 },
    { maxMinutes: null, percent: 0 }, // catch-all (>120)
  ],
  // Aturan owner: telat Rp1.000/menit dari jam buka; telat ≥30 menit → gaji
  // hari itu 0. Bracket di atas hanya dipakai bila mode diubah ke "bracket".
  "late.penalty": {
    mode: "per_minute",
    perMinute: 1000,
    cutoffMinutes: 30,
  },
  [PAYROLL_KEYS.overtime]: {
    enabled: true,
    startHour: 23,
    startMinute: 0,
    autoFromWage: true, // rate = dailyWage/8 * 1.5
    hourlyRate: 0, // dipakai kalau autoFromWage=false
    holidayMultiplier: 2,
    maxHoursPerDay: 4,
  },
  [PAYROLL_KEYS.feePool]: {
    enabled: true,
    perProduct: 1000,
    splitMode: "equal", // proportional_hours | equal — owner: fee dibagi rata ke karyawan
    fallbackMode: "hangus", // hangus | kas
    minMinutes: 60,
    excludePromo: true,
    excludeRoles: Array.from(MANAGER_ROLES),
  },
  [PAYROLL_KEYS.bonusTarget]: {
    enabled: false,
    dailyOrderThreshold: 250,
    amountPerStaff: 20000,
  },
  [PAYROLL_KEYS.bonusZeroKomplain]: {
    enabled: false,
    amountPerStaff: 10000,
  },
  [PAYROLL_KEYS.bonusAttendance]: {
    enabled: false,
    amount: 100000,
    allowLateOnce: true,
  },
  [PAYROLL_KEYS.payout]: {
    mode: "manual", // manual | auto
    autoDay: 1,
    minBalance: 50000,
    cutoffHour: 22,
  },
  [PAYROLL_KEYS.slip]: {
    headerNote: "Garage Coffee",
    footerNote: "Terima kasih atas dedikasi Anda.",
    includeSignature: false,
  },
  [PAYROLL_KEYS.security]: {
    pinLength: 6,
    maxPinAttempts: 5,
    lockMinutes: 15,
    photoRetentionDays: 90,
  },
  // amount 0 = belum diisi. Isi dengan UMK resmi yang berlaku (SK Gubernur/Disnaker).
  [PAYROLL_KEYS.umk]: {
    amount: 0,
    region: "Kota Tebing Tinggi",
    year: 2026,
  },
  // Kosong = tidak disalin. Contoh: "G:\\My Drive\\Garage Backup" atau "E:\\GarageBackup".
  [PAYROLL_KEYS.backup]: {
    copyToDir: "",
  },
};

// ---------- Cache in-memory (60 detik) ----------

type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function readCache(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: unknown) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Bersihkan cache (dipakai setelah update setting). */
export function invalidatePayrollSettings(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}

// ---------- API publik ----------

/** Baca 1 setting. Return default kalau row belum ada. */
export async function getPayrollSetting<T = unknown>(key: string): Promise<T> {
  const cached = readCache(key);
  if (cached !== undefined) return cached as T;

  const db = getDb();
  const rows = await db
    .select({ value: payrollSettings.value })
    .from(payrollSettings)
    .where(eq(payrollSettings.key, key))
    .limit(1);

  const value = (rows[0]?.value ?? PAYROLL_DEFAULTS[key] ?? null) as T;
  writeCache(key, value);
  return value;
}

/** Baca semua setting sekali jalan (untuk UI settings). */
export async function getAllPayrollSettings(): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db.select().from(payrollSettings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // Merge default supaya UI selalu punya nilai
  const merged: Record<string, unknown> = { ...PAYROLL_DEFAULTS };
  for (const [k, v] of Object.entries(stored)) merged[k] = v;
  return merged;
}

/** Simpan/update 1 setting. Return value baru. */
export async function setPayrollSetting(
  key: string,
  value: unknown,
  actorUserId?: string,
): Promise<unknown> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(payrollSettings)
    .values({
      key,
      value: value as never,
      updatedBy: actorUserId ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: payrollSettings.key,
      set: {
        value: value as never,
        updatedBy: actorUserId ?? null,
        updatedAt: now,
      },
    });
  invalidatePayrollSettings(key);
  return value;
}

/** Feature flag global. */
export function isPayrollV2Enabled(): boolean {
  return process.env.PAYROLL_V2_ENABLED === "true";
}

/** Guard: apakah role ini dapat fee pool? */
export function isRoleEligibleForFeePool(role: string, excludeRoles: string[]): boolean {
  if (!role) return false;
  if (MANAGER_ROLES.has(role)) return false;
  if (excludeRoles.includes(role)) return false;
  return true;
}

/** Hitung persen upah berdasar bracket telat. */
export function computeLatePercent(
  lateMinutes: number,
  brackets: Array<{ maxMinutes: number | null; percent: number }>,
): number {
  const sane = Math.max(0, Math.floor(lateMinutes));
  for (const b of brackets) {
    if (b.maxMinutes === null || sane <= b.maxMinutes) return b.percent;
  }
  return 0;
}

/** Haversine distance (meter). */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
