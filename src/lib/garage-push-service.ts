// Web Push subscription management — scaffold awal.
// Foundation untuk fitur notificationPushEnabled di /control/settings.
//
// Untuk benar-benar kirim push notification ke browser, perlu:
// 1. VAPID keys di env (GARAGE_VAPID_PUBLIC, GARAGE_VAPID_PRIVATE)
// 2. npm install web-push (atau alternatif native fetch ke endpoint browser)
// 3. Service worker di public/sw.js untuk handle push event
// 4. Client subscribe flow yang minta permission + register subscription
//
// File ini handle (3) sebagian + database layer untuk subscribe/unsubscribe.

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getAppSettings } from "@/lib/garage-service";

export type PushSubscriptionInput = {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string | null;
  expiresAt?: Date | null;
};

export async function subscribePush(
  input: PushSubscriptionInput,
): Promise<{ id: string; created: boolean }> {
  const db = getDb();

  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: input.userId,
        keyP256dh: input.keys.p256dh,
        keyAuth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        expiresAt: input.expiresAt ?? null,
        failureCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
    return { id: existing[0].id, created: false };
  }

  const [inserted] = await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      keyP256dh: input.keys.p256dh,
      keyAuth: input.keys.auth,
      userAgent: input.userAgent ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: pushSubscriptions.id });
  return { id: inserted.id, created: true };
}

export async function unsubscribePush(endpoint: string, userId: string): Promise<{ deleted: number }> {
  const result = await getDb()
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)),
    )
    .returning({ id: pushSubscriptions.id });
  return { deleted: result.length };
}

export async function listUserSubscriptions(userId: string) {
  const rows = await getDb()
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      expiresAt: pushSubscriptions.expiresAt,
      lastSentAt: pushSubscriptions.lastSentAt,
      failureCount: pushSubscriptions.failureCount,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
  return rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

// Track failure (e.g., 410 Gone dari endpoint) untuk auto-cleanup later.
export async function recordPushFailure(endpoint: string): Promise<void> {
  await getDb()
    .update(pushSubscriptions)
    .set({
      failureCount: sql`${pushSubscriptions.failureCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

// Cleanup expired/failed subscriptions (>= 5 consecutive failures).
export async function cleanupDeadSubscriptions(): Promise<{ deleted: number }> {
  const result = await getDb()
    .delete(pushSubscriptions)
    .where(sql`${pushSubscriptions.failureCount} >= 5`)
    .returning({ id: pushSubscriptions.id });
  return { deleted: result.length };
}

// Cek apakah push aktif secara global.
export async function isPushEnabled(): Promise<boolean> {
  try {
    const settings = await getAppSettings(null);
    return Boolean(settings.notificationPushEnabled);
  } catch {
    return false;
  }
}

// Expose VAPID public key untuk client subscribe flow.
export function getVapidPublicKey(): string | null {
  return process.env.GARAGE_VAPID_PUBLIC ?? null;
}
