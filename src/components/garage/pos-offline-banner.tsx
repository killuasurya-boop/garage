"use client";

// Banner mode jual offline POS (Fase 4, owner 25 Nov 2026).
// - Offline: merah, jumlah penjualan tersimpan di perangkat, aturan singkat (Tunai / QRIS statis saja).
// - Online + antrean: amber, sinkron otomatis + tombol "Sinkron sekarang".
// - Ditolak server (perlu ditinjau): tetap tampil dengan daftar & alasan — tidak pernah dibuang otomatis.
// Tidak tampil saat online dan antrean kosong.

import { AlertTriangle, CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { currency } from "@/lib/garage-data";
import type { PosOfflineStatus } from "@/lib/pos-offline-status";
import { triggerSyncNow } from "@/lib/pos-offline-sync";

export function PosOfflineBanner({ status }: { status: PosOfflineStatus }) {
  const { online, pendingCount, queue, refresh } = status;
  const [showReview, setShowReview] = useState(false);
  const needsReview = queue.filter((row) => row.status === "failed" && row.permanent);
  const waiting = pendingCount - needsReview.length;

  if (online && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pos-offline-banner"
      data-state={online ? "pending" : "offline"}
      className={`rounded-md border px-3 py-2 text-sm ${
        online ? "border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffe0ad]" : "border-[#d11a2a]/55 bg-[#d11a2a]/14 text-[#ffd0c8]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {online ? <Wifi className="size-4 shrink-0" aria-hidden /> : <CloudOff className="size-4 shrink-0" aria-hidden />}
          <span className="font-bold">{online ? "Online" : "Offline"}</span>
          <span>
            {online
              ? `${waiting} penjualan offline sedang dikirim ke server.`
              : waiting > 0
                ? `${waiting} penjualan tersimpan di perangkat. Jangan tutup/muat ulang halaman POS.`
                : "Tetap bisa jual Tunai atau QRIS statis (cek mutasi nanti). Jangan muat ulang halaman."}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {needsReview.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-[#d11a2a]/60 bg-[#d11a2a]/12 px-2 text-xs font-bold text-[#ffd0c8]"
              onClick={() => setShowReview((value) => !value)}
              aria-expanded={showReview}
              data-testid="pos-offline-review-toggle"
            >
              <AlertTriangle className="size-3.5" aria-hidden />
              {needsReview.length} perlu ditinjau
            </Button>
          ) : null}
          {online && waiting > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                triggerSyncNow();
                window.setTimeout(refresh, 800);
              }}
              className="h-8 gap-1 border-[#f5a742]/60 bg-[#f5a742]/12 px-2 text-xs font-bold text-[#ffd79a]"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Sinkron sekarang
            </Button>
          ) : null}
        </div>
      </div>
      {showReview && needsReview.length ? (
        <ul className="mt-2 space-y-1.5 border-t border-current/20 pt-2" data-testid="pos-offline-review-list">
          {needsReview.map((row) => (
            <li key={row.id} className="text-[13px] leading-5">
              <span className="font-mono font-semibold">{row.offlineNo ?? row.id.slice(0, 8)}</span>
              {row.summary?.total != null ? <> · {currency.format(row.summary.total)}</> : null}
              {" · "}
              <span>{row.errorMessage ?? "Ditolak server."}</span>
            </li>
          ))}
          <li className="text-[12px] leading-5 opacity-90">
            Data tetap tersimpan di perangkat. Laporkan ke Owner/Manajer untuk ditinjau (uangnya sudah diterima kasir).
          </li>
        </ul>
      ) : null}
    </div>
  );
}
