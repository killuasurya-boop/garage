// =============================================================================
// Pembatas tebakan PIN yang TAHAN RESTART (audit 29 Okt 2026 #13).
// Dulu hitungan PIN salah kiosk absensi ada di memori proses → ter-reset setiap deploy/
// restart, sehingga tebakan bisa dilanjutkan. Kini disimpan di rate_limit_counters
// (sama dengan rate-limit-db.ts): 8 PIN salah dalam jendela 5 menit → terkunci sampai
// jendela berakhir. Jendela tetap (bukan geser) agar satu baris per kunci per jendela.
// =============================================================================
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitCounters } from "@/db/schema";
import { hitRateLimit } from "@/lib/rate-limit-db";

export const PIN_MAX_FAILS = 8;
export const PIN_WINDOW_MS = 5 * 60_000;

const bucketOf = (key: string) => `pinfail:${key}`;

function windowStartOf(nowMs: number) {
  return new Date(nowMs - (nowMs % PIN_WINDOW_MS));
}

/** Masih boleh mencoba? Hanya membaca (tidak menambah hitungan). */
export async function checkPinAttempt(key: string, now = new Date()): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const start = windowStartOf(now.getTime());
  const [row] = await getDb()
    .select({ count: rateLimitCounters.count })
    .from(rateLimitCounters)
    .where(and(eq(rateLimitCounters.bucket, bucketOf(key)), eq(rateLimitCounters.windowStart, start)))
    .limit(1);
  if (Number(row?.count ?? 0) < PIN_MAX_FAILS) return { allowed: true };
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((start.getTime() + PIN_WINDOW_MS - now.getTime()) / 1000)) };
}

/** Catat satu PIN salah (atomik, aman lintas proses). */
export async function recordPinFailure(key: string, now = new Date()) {
  return hitRateLimit(bucketOf(key), { limit: PIN_MAX_FAILS, windowMs: PIN_WINDOW_MS, now });
}

/** PIN benar → hapus hitungan kunci ini (jendela berjalan). */
export async function resetPinAttempts(key: string) {
  await getDb().delete(rateLimitCounters).where(eq(rateLimitCounters.bucket, bucketOf(key)));
}

/** Untuk tes/diagnosa: jumlah kunci PIN yang sedang terkunci. */
export async function lockedPinKeys(now = new Date()) {
  const start = windowStartOf(now.getTime());
  const rows = await getDb()
    .select({ bucket: rateLimitCounters.bucket })
    .from(rateLimitCounters)
    .where(and(like(rateLimitCounters.bucket, "pinfail:%"), eq(rateLimitCounters.windowStart, start), sql`${rateLimitCounters.count} >= ${PIN_MAX_FAILS}`));
  return rows.map((row) => row.bucket.slice("pinfail:".length));
}
