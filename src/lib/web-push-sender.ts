// =============================================================================
// Web Push (notifikasi saat HP terkunci) — tanpa layanan berbayar: memakai
// standar Web Push + VAPID. Kunci VAPID dibuat otomatis sekali lalu disimpan di
// tabel system_keys (atau dari env GARAGE_VAPID_PUBLIC / GARAGE_VAPID_PRIVATE).
// Semua pengiriman non-blocking: gagal kirim tidak boleh menggagalkan transaksi.
// =============================================================================

import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { getDb } from "@/db";
import { orderPushSubscriptions, partnerPushSubscriptions, pushSubscriptions, systemKeys } from "@/db/schema";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

let cachedKeys: { publicKey: string; privateKey: string } | null = null;

/** Kunci VAPID: env bila ada, kalau tidak dibuat sekali & disimpan di DB. */
export async function getVapidKeys() {
  if (cachedKeys) return cachedKeys;
  const envPublic = process.env.GARAGE_VAPID_PUBLIC?.trim();
  const envPrivate = process.env.GARAGE_VAPID_PRIVATE?.trim();
  if (envPublic && envPrivate) {
    cachedKeys = { publicKey: envPublic, privateKey: envPrivate };
    return cachedKeys;
  }
  const db = getDb();
  const read = async () => {
    const rows = await db
      .select()
      .from(systemKeys)
      .where(inArray(systemKeys.key, ["vapid_public", "vapid_private"]));
    const publicKey = rows.find((row) => row.key === "vapid_public")?.value;
    const privateKey = rows.find((row) => row.key === "vapid_private")?.value;
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };
  let keys = await read();
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    // Dua pasang kunci tidak boleh bercampur: sisipkan berdua dalam satu transaksi,
    // lalu baca ulang (pemenang balapan yang dipakai).
    await db.transaction(async (tx) => {
      await tx
        .insert(systemKeys)
        .values([
          { key: "vapid_public", value: generated.publicKey },
          { key: "vapid_private", value: generated.privateKey },
        ])
        .onConflictDoNothing();
    });
    keys = await read();
  }
  if (!keys) throw new Error("Kunci VAPID gagal dibuat.");
  cachedKeys = keys;
  return keys;
}

async function configure() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(process.env.GARAGE_VAPID_SUBJECT?.trim() || "mailto:admin@garage.id", keys.publicKey, keys.privateKey);
}

type Target = { id: string; endpoint: string; keyP256dh: string; keyAuth: string };

async function deliver(targets: Target[], payload: PushPayload, onGone: (ids: string[]) => Promise<void>) {
  if (!targets.length) return { sent: 0 };
  await configure();
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/os",
    tag: payload.tag,
    requireInteraction: payload.requireInteraction ?? false,
  });
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.keyP256dh, auth: target.keyAuth } },
          body,
          { TTL: 60 * 30, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410 = langganan sudah tidak berlaku (app dihapus / izin dicabut).
        if (status === 404 || status === 410) gone.push(target.id);
      }
    }),
  );
  if (gone.length) await onGone(gone);
  return { sent };
}

/** Kirim ke semua perangkat milik user staf tertentu. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { sent: 0 };
  const db = getDb();
  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      keyP256dh: pushSubscriptions.keyP256dh,
      keyAuth: pushSubscriptions.keyAuth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, ids));
  return deliver(targets, payload, async (gone) => {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  });
}

/** Kirim ke perangkat pelanggan yang berlangganan status satu pesanan. */
export async function sendOrderPush(orderId: string, payload: PushPayload) {
  const db = getDb();
  const targets = await db
    .select({
      id: orderPushSubscriptions.id,
      endpoint: orderPushSubscriptions.endpoint,
      keyP256dh: orderPushSubscriptions.keyP256dh,
      keyAuth: orderPushSubscriptions.keyAuth,
    })
    .from(orderPushSubscriptions)
    .where(eq(orderPushSubscriptions.orderId, orderId));
  return deliver(targets, payload, async (gone) => {
    await db.delete(orderPushSubscriptions).where(inArray(orderPushSubscriptions.id, gone));
  });
}

export async function subscribeOrderPush(input: {
  orderId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const db = getDb();
  await db
    .insert(orderPushSubscriptions)
    .values({ orderId: input.orderId, endpoint: input.endpoint, keyP256dh: input.keys.p256dh, keyAuth: input.keys.auth })
    .onConflictDoUpdate({
      target: [orderPushSubscriptions.orderId, orderPushSubscriptions.endpoint],
      set: { keyP256dh: input.keys.p256dh, keyAuth: input.keys.auth },
    });
  return { ok: true };
}

export async function unsubscribeOrderPush(orderId: string, endpoint: string) {
  await getDb()
    .delete(orderPushSubscriptions)
    .where(and(eq(orderPushSubscriptions.orderId, orderId), eq(orderPushSubscriptions.endpoint, endpoint)));
  return { ok: true };
}

/** Kirim ke HP mitra (Portal Mitra) — pesanan baru saat layar terkunci. Tanpa langganan = tidak melakukan apa-apa. */
export async function sendPartnerPush(partnerId: string, payload: PushPayload) {
  const db = getDb();
  const targets = await db
    .select({
      id: partnerPushSubscriptions.id,
      endpoint: partnerPushSubscriptions.endpoint,
      keyP256dh: partnerPushSubscriptions.keyP256dh,
      keyAuth: partnerPushSubscriptions.keyAuth,
    })
    .from(partnerPushSubscriptions)
    .where(eq(partnerPushSubscriptions.partnerId, partnerId));
  return deliver(targets, payload, async (gone) => {
    await db.delete(partnerPushSubscriptions).where(inArray(partnerPushSubscriptions.id, gone));
  });
}

export async function subscribePartnerPush(input: { partnerId: string; accountId: string; endpoint: string; keys: { p256dh: string; auth: string } }) {
  await getDb()
    .insert(partnerPushSubscriptions)
    .values({ partnerId: input.partnerId, accountId: input.accountId, endpoint: input.endpoint, keyP256dh: input.keys.p256dh, keyAuth: input.keys.auth })
    .onConflictDoUpdate({
      target: partnerPushSubscriptions.endpoint,
      // Perangkat yang sama dipakai akun/mitra lain → langganan pindah (tidak ada push silang antar mitra).
      set: { partnerId: input.partnerId, accountId: input.accountId, keyP256dh: input.keys.p256dh, keyAuth: input.keys.auth },
    });
  return { ok: true };
}

export async function unsubscribePartnerPush(partnerId: string, endpoint: string) {
  await getDb()
    .delete(partnerPushSubscriptions)
    .where(and(eq(partnerPushSubscriptions.partnerId, partnerId), eq(partnerPushSubscriptions.endpoint, endpoint)));
  return { ok: true };
}
