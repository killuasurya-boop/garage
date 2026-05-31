import { createHmac, timingSafeEqual } from "node:crypto";

// ============================================================================
// Timezone (WIB / Asia/Jakarta)
// ============================================================================
// App memakai WIB untuk semua batas "hari ini". Hindari new Date().toISOString()
// (UTC) untuk hitung tanggal — bisa loncat hari setelah jam 17:00 WIB.

const JAKARTA_OFFSET = "+07:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export function jakartaDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function jakartaDayRange(date = new Date()): { start: Date; end: Date } {
  const start = new Date(`${jakartaDateKey(date)}T00:00:00${JAKARTA_OFFSET}`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

// Menit sejak tengah malam WIB untuk timestamp tertentu (0..1439).
export function jakartaMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Parse "HH:MM" -> menit sejak tengah malam, atau null bila invalid.
export function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// ============================================================================
// PIN hashing (HMAC-SHA256, deterministik agar bisa di-lookup)
// ============================================================================
// bcrypt tidak dipakai karena absensi melakukan lookup BY pin (belum tahu siapa
// staffnya), jadi butuh hash deterministik. Pepper dari env; fallback konstanta
// dev agar build tidak butuh secret.

const PIN_PEPPER =
  process.env.ATTENDANCE_PIN_PEPPER ?? "garage-os-attendance-pin-pepper-v1";

export function hashPin(pin: string): string {
  return createHmac("sha256", PIN_PEPPER).update(pin.trim()).digest("hex");
}

export function pinHashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ============================================================================
// Geofence
// ============================================================================

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================================
// Shift compliance
// ============================================================================

export type AttendanceStatus = "normal" | "on_time" | "late" | "early_leave";

// Toleransi telat / pulang cepat (menit).
export const LATE_GRACE_MINUTES = 10;
export const EARLY_LEAVE_GRACE_MINUTES = 10;

// Tentukan status punch terhadap jadwal shift hari itu.
export function evaluatePunchStatus(args: {
  action: "in" | "out";
  punchAt: Date;
  startTime: string | null;
  endTime: string | null;
}): AttendanceStatus {
  const punchMin = jakartaMinutesOfDay(args.punchAt);
  if (args.action === "in") {
    const startMin = parseClockMinutes(args.startTime);
    if (startMin == null) return "normal";
    return punchMin > startMin + LATE_GRACE_MINUTES ? "late" : "on_time";
  }
  const endMin = parseClockMinutes(args.endTime);
  if (endMin == null) return "normal";
  return punchMin < endMin - EARLY_LEAVE_GRACE_MINUTES ? "early_leave" : "on_time";
}

export function attendanceStatusLabel(status: string): string {
  switch (status) {
    case "late":
      return "Telat";
    case "early_leave":
      return "Pulang Cepat";
    case "on_time":
      return "Tepat Waktu";
    default:
      return "Normal";
  }
}

// ============================================================================
// Pairing in/out -> jam kerja
// ============================================================================

export type PunchRow = {
  action: string; // 'in' | 'out'
  timestamp: Date;
  status?: string;
};

export type WorkedStats = {
  presentDays: number;
  workedMinutes: number;
  lateCount: number;
  earlyLeaveCount: number;
  unpairedCount: number; // punch IN tanpa OUT pasangan
};

// Hitung jam kerja dari rangkaian punch (urut apa saja). Pasangkan IN->OUT
// per hari WIB; IN tanpa OUT diabaikan dari total tapi dihitung unpaired.
export function computeWorkedStats(punches: PunchRow[]): WorkedStats {
  const byDay = new Map<string, PunchRow[]>();
  for (const p of punches) {
    const key = jakartaDateKey(p.timestamp);
    const list = byDay.get(key) ?? [];
    list.push(p);
    byDay.set(key, list);
  }

  let workedMinutes = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let unpairedCount = 0;
  let presentDays = 0;

  for (const list of byDay.values()) {
    const sorted = [...list].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    let openIn: PunchRow | null = null;
    let dayHadPunch = false;
    for (const p of sorted) {
      if (p.status === "late") lateCount += 1;
      if (p.status === "early_leave") earlyLeaveCount += 1;
      if (p.action === "in") {
        if (openIn) unpairedCount += 1; // IN ganda tanpa OUT
        openIn = p;
        dayHadPunch = true;
      } else if (p.action === "out") {
        dayHadPunch = true;
        if (openIn) {
          workedMinutes += Math.max(
            0,
            Math.round((p.timestamp.getTime() - openIn.timestamp.getTime()) / 60000),
          );
          openIn = null;
        }
      }
    }
    if (openIn) unpairedCount += 1;
    if (dayHadPunch) presentDays += 1;
  }

  return { presentDays, workedMinutes, lateCount, earlyLeaveCount, unpairedCount };
}

export function formatWorkedHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}j ${m}m`;
}

// ============================================================================
// Rate limit (in-memory, best-effort per proses)
// ============================================================================
// Cegah brute-force PIN dari satu terminal. Key = id operator/sesi terminal.

type RateBucket = { count: number; windowStart: number; lockedUntil: number };
const rateBuckets = new Map<string, RateBucket>();

const RATE_WINDOW_MS = 60_000; // 1 menit
const RATE_MAX_FAILS = 8; // gagal beruntun sebelum lock
const RATE_LOCK_MS = 5 * 60_000; // lock 5 menit

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (bucket && bucket.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  bucket.count += 1;
  if (bucket.count >= RATE_MAX_FAILS) {
    bucket.lockedUntil = now + RATE_LOCK_MS;
    bucket.count = 0;
    bucket.windowStart = now;
  }
}

export function resetRateLimit(key: string): void {
  rateBuckets.delete(key);
}
