"use client";

// Banner status koneksi + queue offline waiter — siap dipasang di header waiter view.
// Komponen self-contained: subscribe ke navigator.onLine + poll queue count.

import { CloudOff, RefreshCw, Wifi } from "lucide-react";

import { useWaiterOfflineStatus } from "@/lib/waiter-offline-status";
import { triggerSyncNow } from "@/lib/waiter-offline-sync";

export function WaiterOfflineBanner() {
  const { online, pendingCount, refresh } = useWaiterOfflineStatus();

  if (online && pendingCount === 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 px-3 py-2 text-xs"
      >
        <div className="flex items-center gap-2 text-[#ffd0c8]">
          <CloudOff className="size-4" aria-hidden />
          <span className="font-semibold">Offline</span>
          {pendingCount > 0 ? (
            <span className="text-[#ffb8b0]">
              · {pendingCount} action menunggu sync
            </span>
          ) : (
            <span className="text-[#ffb8b0]">
              · Tap Antar tetap jalan, sync saat online
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 px-3 py-2 text-xs"
    >
      <div className="flex items-center gap-2 text-[#ffd79a]">
        <Wifi className="size-4" aria-hidden />
        <span className="font-semibold">Online</span>
        <span className="text-[#ffe0bd]">
          · {pendingCount} action menunggu sync (retry otomatis)
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          triggerSyncNow();
          setTimeout(refresh, 500);
        }}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/10 px-2 text-[10px] font-bold uppercase tracking-wider text-[#ffd79a] transition hover:bg-[#f5a742]/20"
      >
        <RefreshCw className="size-3" />
        Sync sekarang
      </button>
    </div>
  );
}
