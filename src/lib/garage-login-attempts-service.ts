import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { loginAttempts } from "@/db/schema";
import { getAppSettings } from "@/lib/garage-service";

export type LoginAttemptRow = {
  id: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  failureReason: string | null;
  attemptedAt: string;
};

export type LockoutState = {
  locked: boolean;
  retryAt: string | null;
  failedCount: number;
  thresholdCount: number;
  windowMinutes: number;
};

export async function recordLoginAttempt(input: {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  failureReason?: string;
}): Promise<void> {
  try {
    await getDb()
      .insert(loginAttempts)
      .values({
        email: input.email.toLowerCase(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        success: input.success,
        failureReason: input.failureReason,
      });
  } catch {
    // login attempt tracking gak boleh blocking auth flow
  }
}

export async function getLockoutState(email: string): Promise<LockoutState> {
  const settings = await getAppSettings(null);
  const thresholdCount = Number(settings.securityFailedLoginLockoutCount) || 0;
  const windowMinutes = Number(settings.securityLockoutDurationMinutes) || 15;

  // Threshold 0 = lockout dinonaktifkan
  if (thresholdCount <= 0) {
    return {
      locked: false,
      retryAt: null,
      failedCount: 0,
      thresholdCount,
      windowMinutes,
    };
  }

  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  const rows = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email.toLowerCase()),
        eq(loginAttempts.success, false),
        gte(loginAttempts.attemptedAt, cutoff),
      ),
    );

  const failedCount = Number(rows[0]?.c ?? 0);
  const locked = failedCount >= thresholdCount;
  const retryAt = locked
    ? new Date(Date.now() + windowMinutes * 60 * 1000).toISOString()
    : null;

  return { locked, retryAt, failedCount, thresholdCount, windowMinutes };
}

// Clear failed attempts saat user berhasil login — biar gak persist lockout
// dari history lama setelah user yang sah berhasil masuk.
export async function clearFailedAttempts(email: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await getDb()
      .delete(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email.toLowerCase()),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, cutoff),
        ),
      );
  } catch {
    // fail-open
  }
}

export async function listLoginAttempts(filters: {
  email?: string;
  successOnly?: boolean;
  failedOnly?: boolean;
  limit?: number;
} = {}): Promise<LoginAttemptRow[]> {
  const limit = Math.min(filters.limit ?? 100, 500);
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters.email) conditions.push(eq(loginAttempts.email, filters.email.toLowerCase()));
  if (filters.successOnly) conditions.push(eq(loginAttempts.success, true));
  if (filters.failedOnly) conditions.push(eq(loginAttempts.success, false));

  const rows = await getDb()
    .select()
    .from(loginAttempts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    success: row.success,
    failureReason: row.failureReason,
    attemptedAt: row.attemptedAt.toISOString(),
  }));
}

export async function getLoginStats(windowHours = 24): Promise<{
  totalAttempts: number;
  failedAttempts: number;
  successAttempts: number;
  uniqueEmails: number;
  lockedNow: number;
}> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const settings = await getAppSettings(null);
  const thresholdCount = Number(settings.securityFailedLoginLockoutCount) || 0;
  const windowMinutes = Number(settings.securityLockoutDurationMinutes) || 15;
  const lockoutCutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

  const db = getDb();
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${loginAttempts.success} = false)::int`,
      success: sql<number>`count(*) filter (where ${loginAttempts.success} = true)::int`,
      unique: sql<number>`count(distinct ${loginAttempts.email})::int`,
    })
    .from(loginAttempts)
    .where(gte(loginAttempts.attemptedAt, cutoff));

  let lockedNow = 0;
  if (thresholdCount > 0) {
    const lockedRows = await db
      .select({
        email: loginAttempts.email,
        c: sql<number>`count(*)::int`,
      })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, lockoutCutoff),
        ),
      )
      .groupBy(loginAttempts.email);
    lockedNow = lockedRows.filter((row) => Number(row.c) >= thresholdCount).length;
  }

  return {
    totalAttempts: Number(totals?.total ?? 0),
    failedAttempts: Number(totals?.failed ?? 0),
    successAttempts: Number(totals?.success ?? 0),
    uniqueEmails: Number(totals?.unique ?? 0),
    lockedNow,
  };
}
