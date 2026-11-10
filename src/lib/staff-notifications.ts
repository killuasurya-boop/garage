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

// "bar" / "dapur" = satu stasiun saja (V2); "production" = kedua stasiun (pengumuman umum).
export type NotificationAudience =
  | "cashier"
  | "courier"
  | "production"
  | "bar"
  | "dapur"
  | "management"
  | "waiter"
  | "all"
  | "user";
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
const BAR_STATIONS = new Set(["bar", "helper_bar", "all", "helper_all"]);
const DAPUR_STATIONS = new Set(["dapur", "helper_dapur", "all", "helper_all"]);
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
  if (role === "Kasir" && PRODUCTION_STATIONS.has(station)) {
    out.push("production");
    // Bar hanya menerima pekerjaan Bar, Dapur hanya Dapur (stasiun "all" = keduanya).
    if (BAR_STATIONS.has(station)) out.push("bar");
    if (DAPUR_STATIONS.has(station)) out.push("dapur");
  }
  return out;
}

/** Audience satu divisi produksi (Minta Bahan, tiket) — tidak pernah ke stasiun lain. */
export function stationAudience(division: "bar" | "dapur"): NotificationAudience {
  return division === "bar" ? "bar" : "dapur";
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
  /** Kunci event — klien memakainya untuk "bunyi sekali per perangkat". */
  dedupKey: string | null;
  /** Kejadian sudah tidak perlu aksi (order diterima, panggilan selesai, …). */
  resolvedAt: string | null;
  resolvedReason: string | null;
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
    dedupKey: n.dedupKey,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
    resolvedReason: n.resolvedReason,
  }));
  // Badge = yang masih perlu perhatian (belum dibaca DAN belum selesai).
  return { items, unreadCount: items.filter((item) => !item.read && !item.resolvedAt).length };
}

/**
 * Tandai notifikasi "selesai" (tidak perlu aksi lagi). Idempoten; dipanggil
 * setelah mutasi domain sukses dan tidak pernah boleh menggagalkannya.
 * `dedupPrefixes` mencocokkan awal dedup_key (mis. "ready_to_deliver:<tiket>:").
 */
export async function resolveStaffNotifications(
  target: { orderId?: string | null; kinds?: string[]; dedupKeys?: string[]; dedupPrefixes?: string[] },
  reason: string,
) {
  const conditions = [];
  if (target.orderId) {
    conditions.push(
      and(
        eq(staffNotifications.orderId, target.orderId),
        target.kinds?.length ? inArray(staffNotifications.kind, target.kinds) : undefined,
      ),
    );
  }
  const keys = (target.dedupKeys ?? []).filter(Boolean);
  if (keys.length) conditions.push(inArray(staffNotifications.dedupKey, keys));
  for (const prefix of target.dedupPrefixes ?? []) {
    if (prefix) conditions.push(sql`${staffNotifications.dedupKey} LIKE ${`${prefix.replace(/[\\%_]/g, "\\$&")}%`}`);
  }
  if (!conditions.length) return { resolved: 0 };
  try {
    const rows = await getDb()
      .update(staffNotifications)
      .set({ resolvedAt: new Date(), resolvedReason: reason.slice(0, 120) })
      .where(and(isNull(staffNotifications.resolvedAt), or(...conditions)))
      .returning({ id: staffNotifications.id });
    if (rows.length) publishProductionChange();
    return { resolved: rows.length };
  } catch (error) {
    console.error("[notifications] resolve gagal", error);
    return { resolved: 0 };
  }
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
