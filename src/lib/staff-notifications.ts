// =============================================================================
// PUSAT NOTIFIKASI STAF — satu feed per outlet untuk semua kejadian penting
// (order QR baru, chat pelanggan, kurir ditugaskan, tolak otomatis, pesanan
// sampai, take away siap diambil). Klien di modul MANA PUN membaca feed ini
// (bukan hanya layar POS), lalu web push meneruskannya ke HP yang terkunci.
// Modul ini sengaja tidak mengimpor garage-service (hindari import melingkar).
// =============================================================================

import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { staffNotificationReads, staffNotifications, staffProfiles } from "@/db/schema";
import type { Role } from "@/lib/garage-data";
import { publishProductionChange } from "@/lib/production-events";
import { canHandleMoney, MANAGEMENT_ROLES } from "@/lib/role-access";

export type NotificationAudience = "cashier" | "courier" | "production" | "management" | "waiter" | "all" | "user";
export type NotificationSeverity = "info" | "warning" | "urgent";

export type NotifyInput = {
  outletId: string | null;
  audience: NotificationAudience;
  userId?: string | null;
  kind: string;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  url?: string | null;
  orderId?: string | null;
  dedupKey?: string | null;
};

const PRODUCTION_STATIONS = new Set(["bar", "dapur", "all", "helper_bar", "helper_dapur", "helper_all"]);
const FEED_WINDOW_MS = 48 * 60 * 60 * 1000;

type ProfileLike = { role: Role | string; workstation?: string | null; position?: string | null };

/** Kelompok penerima yang berlaku untuk satu akun. */
export function audiencesFor(profile: ProfileLike): NotificationAudience[] {
  const role = profile.role as Role;
  const station = (profile.workstation ?? "").trim().toLowerCase();
  const out: NotificationAudience[] = ["all"];
  if (canHandleMoney({ role, workstation: profile.workstation, position: profile.position })) out.push("cashier");
  if (MANAGEMENT_ROLES.includes(role)) out.push("management");
  if (role === "Waiter" && station === "kurir") out.push("courier");
  else if (role === "Waiter") out.push("waiter");
  if (role === "Kasir" && PRODUCTION_STATIONS.has(station)) out.push("production");
  return out;
}

/** Simpan notifikasi (anti-dobel lewat dedupKey), bangunkan layar, kirim push. */
export async function notifyStaff(input: NotifyInput) {
  const db = getDb();
  const [row] = await db
    .insert(staffNotifications)
    .values({
      outletId: input.outletId,
      audience: input.audience,
      userId: input.userId ?? null,
      kind: input.kind,
      severity: input.severity ?? "info",
      title: input.title.slice(0, 140),
      body: input.body?.slice(0, 300) ?? null,
      url: input.url ?? null,
      orderId: input.orderId ?? null,
      dedupKey: input.dedupKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return null; // dobel
  publishProductionChange();
  void pushToAudience(row).catch(() => undefined);
  return row;
}

async function pushToAudience(row: typeof staffNotifications.$inferSelect) {
  const db = getDb();
  // Hormati Pengaturan → Notifikasi → Push (dimuat malas: hindari import melingkar).
  const { getAppSettings } = await import("@/lib/garage-service");
  if (!(await getAppSettings(row.outletId ?? null)).notificationPushEnabled) return;
  let userIds: string[] = [];
  if (row.audience === "user") {
    userIds = row.userId ? [row.userId] : [];
  } else {
    const staff = await db
      .select({ userId: staffProfiles.userId, role: staffProfiles.role, workstation: staffProfiles.workstation, position: staffProfiles.position })
      .from(staffProfiles)
      .where(and(eq(staffProfiles.status, "active"), row.outletId ? eq(staffProfiles.outletId, row.outletId) : undefined));
    userIds = staff
      .filter((member) => audiencesFor(member).includes(row.audience as NotificationAudience))
      .map((member) => member.userId);
  }
  if (!userIds.length) return;
  const { sendPushToUsers } = await import("@/lib/web-push-sender");
  await sendPushToUsers(userIds, {
    title: row.title,
    body: row.body ?? undefined,
    url: row.url ?? "/os",
    tag: row.dedupKey ?? row.kind,
    requireInteraction: row.severity === "urgent",
  });
}

export type StaffNotificationView = {
  id: string;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  url: string | null;
  orderId: string | null;
  createdAt: string;
  read: boolean;
};

/** Feed untuk user ini (48 jam terakhir) + jumlah belum dibaca. */
export async function listStaffNotifications(
  session: { userId: string; outletId: string; profile: ProfileLike },
  opts?: { limit?: number },
) {
  const db = getDb();
  const audiences = audiencesFor(session.profile);
  const since = new Date(Date.now() - FEED_WINDOW_MS);
  const rows = await db
    .select({ n: staffNotifications, readAt: staffNotificationReads.readAt })
    .from(staffNotifications)
    .leftJoin(
      staffNotificationReads,
      and(
        eq(staffNotificationReads.notificationId, staffNotifications.id),
        eq(staffNotificationReads.userId, session.userId),
      ),
    )
    .where(
      and(
        gte(staffNotifications.createdAt, since),
        or(isNull(staffNotifications.outletId), eq(staffNotifications.outletId, session.outletId)),
        or(
          and(eq(staffNotifications.audience, "user"), eq(staffNotifications.userId, session.userId)),
          inArray(staffNotifications.audience, audiences.filter((audience) => audience !== "user")),
        ),
      ),
    )
    .orderBy(desc(staffNotifications.createdAt))
    .limit(opts?.limit ?? 50);
  const items: StaffNotificationView[] = rows.map(({ n, readAt }) => ({
    id: n.id,
    kind: n.kind,
    severity: (n.severity as NotificationSeverity) ?? "info",
    title: n.title,
    body: n.body,
    url: n.url,
    orderId: n.orderId,
    createdAt: n.createdAt.toISOString(),
    read: Boolean(readAt),
  }));
  return { items, unreadCount: items.filter((item) => !item.read).length };
}

export async function markStaffNotificationsRead(userId: string, ids: string[]) {
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (!unique.length) return { marked: 0 };
  await getDb()
    .insert(staffNotificationReads)
    .values(unique.map((notificationId) => ({ notificationId, userId })))
    .onConflictDoNothing();
  return { marked: unique.length };
}

/** Bersihkan feed lama (dipanggil sweeper harian/menit). */
export async function pruneStaffNotifications(olderThanDays = 14) {
  await getDb()
    .delete(staffNotifications)
    .where(sql`${staffNotifications.createdAt} < now() - (${olderThanDays} || ' days')::interval`);
}
