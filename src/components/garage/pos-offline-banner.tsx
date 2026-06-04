"use client";

// Banner status koneksi + queue offline POS — siap dipasang di header POS view.
// Pakai usePosOfflineStatus hook + triggerSyncNow.
//
// Pemakaian:
//   <PosOfflineBanner />
//
// Komponen self-contained: subscribe ke navigator.onLine + poll queue count
// tiap 5s. Banner muncul HANYA saat offline atau ada pending.

import { CloudOff, RefreshCw, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePosOfflineStatus } from "@/lib/pos-offline-status";
import { triggerSyncNow } from "@/lib/pos-offline-sync";

export function PosOfflineBanner() {
  const { online, pendingCount, refresh } = usePosOfflineStatus();

  // Tidak tampil saat online & queue kosong (zero-friction default state)
  if (online && pendingCount === 0) return null;

  const tone = !online ? "offline" : "pending";

  if (tone === "offline") {
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
              · {pendingCount} order menunggu sync
            </span>
          ) : (
            <span className="text-[#ffb8b0]">· Order tetap bisa dibuat, sync saat online</span>
          )}
        </div>
      </div>
    );
  }

  // online + ada pending → banner kuning + tombol sync manual
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
          · {pendingCount} order menunggu sync (retry otomatis tiap 30s)
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          triggerSyncNow();
          // Refresh badge segera (worker async)
          setTimeout(refresh, 500);
        }}
        className="h-7 gap-1 border-[#f5a742]/55 bg-[#f5a742]/10 px-2 text-[10px] font-bold uppercase tracking-wider text-[#ffd79a] hover:bg-[#f5a742]/20"
      >
        <RefreshCw className="size-3" />
        Sync sekarang
      </Button>
    </div>
  );
}
