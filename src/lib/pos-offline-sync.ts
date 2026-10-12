"use client";

// Background retry worker untuk offline queue.
// - Polling 30s saat window aktif
// - Trigger paksa saat 'online' event
// - Pakai idempotency key sehingga aman dari double-submit (backend dilapis juga)
//
// Pemakaian (di root POS view):
//   useEffect(() => { startSyncWorker(); return () => stopSyncWorker(); }, []);

import {
  listQueue,
  markFailed,
  markSynced,
  markSyncing,
} from "@/lib/pos-offline-queue";

const RETRY_INTERVAL_MS = 30_000;

let intervalId: number | null = null;
let onlineListener: (() => void) | null = null;
let visibilityListener: (() => void) | null = null;
let running = false;

async function syncOne(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const all = await listQueue();
  // Item yang ditolak permanen dilewati, supaya satu order bermasalah tidak
  // memacetkan seluruh antrean (dulu selalu mencoba item gagal tertua dulu).
  const target =
    all.find((q) => q.status === "pending") ??
    all.find((q) => q.status === "failed" && !q.permanent);
  if (!target) return false;

  await markSyncing(target.id);
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": target.id,
        "X-Garage-Offline-Sync": "1",
        // Waktu order dibuat saat offline — server hanya melonggarkan cek
        // uang kurang untuk order yang memang tertahan di antrean.
        "X-Garage-Offline-Created-At": String(target.createdAt),
      },
      body: JSON.stringify(target.payload),
    });
    if (res.ok || res.status === 200) {
      await markSynced(target.id);
      return true;
    }
    // 409 ORDER_IN_PROGRESS = duplikat baru sebagian: tunggu
    // 400 = invalid payload (tidak retry, mark failed)
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message ?? `HTTP ${res.status}`;
    // 4xx selain 408/409/429 = ditolak permanen; 5xx/408/409/429 dicoba lagi.
    const permanent = res.status >= 400 && res.status < 500 && ![408, 409, 429].includes(res.status);
    await markFailed(target.id, msg, permanent);
    return false;
  } catch (e) {
    await markFailed(target.id, e instanceof Error ? e.message : "Network error");
    return false;
  }
}

async function syncLoop() {
  if (running) return;
  running = true;
  try {
    // Sync 1 per tick (jaga ringan). Tick 30s atau saat trigger online.
    await syncOne();
  } finally {
    running = false;
  }
}

export function startSyncWorker() {
  if (typeof window === "undefined") return;
  if (intervalId !== null) return; // sudah jalan
  // Polling
  intervalId = window.setInterval(() => {
    void syncLoop();
  }, RETRY_INTERVAL_MS);
  // Online → trigger paksa
  onlineListener = () => void syncLoop();
  window.addEventListener("online", onlineListener);
  // Tab kembali visible → trigger paksa
  visibilityListener = () => {
    if (document.visibilityState === "visible") void syncLoop();
  };
  document.addEventListener("visibilitychange", visibilityListener);
  // Kick off pertama
  void syncLoop();
}

export function stopSyncWorker() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (onlineListener) {
    window.removeEventListener("online", onlineListener);
    onlineListener = null;
  }
  if (visibilityListener) {
    document.removeEventListener("visibilitychange", visibilityListener);
    visibilityListener = null;
  }
}

/** Trigger sync sekarang (untuk tombol manual "Sync Sekarang"). */
export function triggerSyncNow() {
  void syncLoop();
}
