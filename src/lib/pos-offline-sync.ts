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
  resetStuckSyncing,
  type QueuedOrder,
} from "@/lib/pos-offline-queue";
import { classifySyncResponse, isRetryDue, OFFLINE_SYNC_BATCH } from "@/lib/pos-offline-rules";

const RETRY_INTERVAL_MS = 30_000;

let intervalId: number | null = null;
let onlineListener: (() => void) | null = null;
let visibilityListener: (() => void) | null = null;
let running = false;
let syncedListener: ((count: number) => void) | null = null;

/** POS memasang listener ini untuk memuat ulang data setelah penjualan offline masuk server. */
export function setPosSyncListener(listener: ((count: number) => void) | null) {
  syncedListener = listener;
}

function endpointFor(item: QueuedOrder) {
  return item.kind === "open-bill" ? "/api/orders/open-bill" : "/api/orders";
}

type SyncStep = "synced" | "failed" | "idle";

async function syncOne(): Promise<SyncStep> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "idle";
  const all = await listQueue();
  const now = Date.now();
  // Item yang ditolak permanen dilewati (tampil di "Perlu ditinjau"); item gagal sementara menunggu jeda backoff.
  const target =
    all.find((q) => q.status === "pending") ??
    all.find((q) => q.status === "failed" && !q.permanent && isRetryDue(q, now));
  if (!target) return "idle";

  await markSyncing(target.id);
  try {
    const res = await fetch(endpointFor(target), {
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
    const errBody = res.ok ? null : await res.json().catch(() => null);
    const outcome = classifySyncResponse(res.status, errBody?.error?.code ?? null);
    if (outcome === "synced") {
      await markSynced(target.id);
      return "synced";
    }
    await markFailed(target.id, errBody?.error?.message ?? `HTTP ${res.status}`, outcome === "permanent");
    return "failed";
  } catch (e) {
    await markFailed(target.id, e instanceof Error ? e.message : "Koneksi terputus");
    return "failed";
  }
}

async function syncLoop() {
  if (running) return;
  running = true;
  let synced = 0;
  try {
    // Kuras antrean (maks OFFLINE_SYNC_BATCH per putaran); berhenti saat tidak ada yang siap atau jaringan gagal.
    for (let index = 0; index < OFFLINE_SYNC_BATCH; index += 1) {
      const step = await syncOne();
      if (step === "synced") synced += 1;
      else if (step === "idle") break;
      else if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  } finally {
    running = false;
    if (synced > 0) syncedListener?.(synced);
  }
}

export function startSyncWorker() {
  if (typeof window === "undefined") return;
  if (intervalId !== null) return; // sudah jalan
  // Item "syncing" yang yatim (tab ditutup saat sinkron) dikembalikan dulu, lalu mulai.
  void resetStuckSyncing().catch(() => undefined).finally(() => void syncLoop());
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
