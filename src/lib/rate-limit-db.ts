// Rate limit persisten (F-06): jendela tetap per kunci di tabel rate_limit_counters.
// Satu statement atomik per permintaan → aman lintas proses/instance dan tidak
// ter-reset saat restart (beda dengan rate-limit.ts in-memory untuk polling publik).
import { lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitCounters } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

const RETENTION_MS = 60 * 60_000;
let lastCleanup = 0;

export type RateLimitResult = { limited: boolean; count: number; limit: number; resetAt: Date };

/** Naikkan penghitung `bucket` di jendela saat ini; limited = melewati `limit`. */
export async function hitRateLimit(
  bucket: string,
  options: { limit: number; windowMs: number; now?: Date },
  db: Db = getDb(),
): Promise<RateLimitResult> {
  const nowMs = (options.now ?? new Date()).getTime();
  const windowStart = new Date(nowMs - (nowMs % options.windowMs));
  const [row] = await db
    .insert(rateLimitCounters)
    .values({ bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucket, rateLimitCounters.windowStart],
      set: { count: sql`${rateLimitCounters.count} + 1` },
    })
    .returning({ count: rateLimitCounters.count });
  if (nowMs - lastCleanup > RETENTION_MS / 4) {
    lastCleanup = nowMs;
    // Bersih-bersih oportunistik; gagal tidak boleh menggagalkan permintaan.
    await db.delete(rateLimitCounters).where(lt(rateLimitCounters.windowStart, new Date(nowMs - RETENTION_MS))).catch(() => undefined);
  }
  const count = Number(row?.count ?? 1);
  return { limited: count > options.limit, count, limit: options.limit, resetAt: new Date(windowStart.getTime() + options.windowMs) };
}
