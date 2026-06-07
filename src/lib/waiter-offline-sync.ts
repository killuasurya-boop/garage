"use client";

// Background retry worker untuk waiter offline queue.
// Pattern mirror dari pos-offline-sync.ts.
//
// Behavior:
// - 422 INVALID_TRANSITION = ticket sudah ke-delivered (mungkin retry sebelumnya
//   sukses tapi response hilang). Treat as synced.
// - 404 TICKET_NOT_FOUND = data sudah hilang (sesi tutup) → mark synced supaya
//   queue tidak macet.
// - 4xx lain = mark failed permanent (manual intervention).
// - 5xx / network = mark failed, akan diretry tick berikut.

import {
  listQueue,
  markFailed,
  markSynced,
  markSyncing,
} from "@/lib/waiter-offline-queue";

const RETRY_INTERVAL_MS = 20_000;

let intervalId: number | null = null;
let onlineListener: (() => void) | null = null;
let visibilityListener: (() => void) | null = null;
let running = false;
let notifyChange: (() => void) | null = null;

export function setSyncListener(fn: (() => void) | null) {
  notifyChange = fn;
}

async function syncOne(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const all = await listQueue();
  const target = all.find((q) => q.status === "pending" || q.status === "failed");
  if (!target) return false;

  await markSyncing(target.id);
  try {
    let url = "";
    if (target.action === "deliver") {
      url = `/api/waiter/tickets/${encodeURIComponent(target.target)}/deliver`;
    } else {
      await markFailed(target.id, `Unknown action: ${target.action}`);
      return false;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": target.id,
      },
    });

    if (res.ok) {
      await markSynced(target.id);
      notifyChange?.();
      return true;
    }

    const errBody = await res.json().catch(() => null);
    const code = errBody?.error?.code as string | undefined;
    const msg = errBody?.error?.message ?? `HTTP ${res.status}`;

    // Treat-as-success cases (idempotent semantics)
    if (
      res.status === 422 && code === "INVALID_TRANSITION" ||
      res.status === 404
    ) {
      await markSynced(target.id);
      notifyChange?.();
      return true;
    }

    // Permanent failure for 4xx non-recoverable
    await markFailed(target.id, msg);
    notifyChange?.();
    return false;
  } catch (e) {
    await markFailed(target.id, e instanceof Error ? e.message : "Network error");
    notifyChange?.();
    return false;
  }
}

async function syncLoop() {
  if (running) return;
  running = true;
  try {
    // Drain sampai habis atau gagal — supaya queue cepat kosong saat online.
    let progressed = true;
    let safety = 0;
    while (progressed && safety < 20) {
      progressed = await syncOne();
      safety += 1;
    }
  } finally {
    running = false;
  }
}

export function startSyncWorker() {
  if (typeof window === "undefined") return;
  if (intervalId !== null) return;
  intervalId = window.setInterval(() => {
    void syncLoop();
  }, RETRY_INTERVAL_MS);
  onlineListener = () => void syncLoop();
  window.addEventListener("online", onlineListener);
  visibilityListener = () => {
    if (document.visibilityState === "visible") void syncLoop();
  };
  document.addEventListener("visibilitychange", visibilityListener);
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

export function triggerSyncNow() {
  void syncLoop();
}
