"use client";

// Helper klien Web Push (staf & pelanggan). Service worker /sw.js didaftarkan
// global; di iPhone push hanya bisa setelah situs "Tambahkan ke Layar Utama".

export type PushSupport = "supported" | "unsupported" | "ios-needs-install";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return ios && !standalone ? "ios-needs-install" : "unsupported";
  }
  return "supported";
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function base64ToBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function getVapidPublicKey() {
  const response = await fetch("/api/push/vapid", { cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as { data?: { publicKey?: string } };
  return json.data?.publicKey ?? null;
}

/**
 * Lepas langganan push perangkat ini saat logout (Smart Notification V2, F-07):
 * tablet bersama tidak boleh terus menerima push akun sebelumnya di layar kunci.
 * Harus dipanggil SEBELUM sesi dihapus (DELETE butuh sesi). Tidak pernah melempar
 * dan dibatasi waktunya supaya logout tidak tertahan.
 */
export async function releasePushSubscriptionOnSignOut(timeoutMs = 2500) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const work = (async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Minta izin + buat langganan push. Null bila ditolak / tidak didukung. */
export async function createPushSubscription() {
  if (pushSupport() !== "supported") return null;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return null;
  const registration = await ensureServiceWorker();
  if (!registration) return null;
  await navigator.serviceWorker.ready;
  const publicKey = await getVapidPublicKey();
  if (!publicKey) return null;
  const current = await registration.pushManager.getSubscription();
  if (current) return current.toJSON();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToBytes(publicKey),
  });
  return subscription.toJSON();
}
