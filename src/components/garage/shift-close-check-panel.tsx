"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { shiftCloseCheckItems, type ShiftCloseCheckData } from "@/lib/shift-close-check";

const EMPTY: ShiftCloseCheckData = {
  unpaidThisShift: { count: 0, total: 0, orderNos: [] },
  unpaidOlder: { count: 0, total: 0 },
  pendingCashMovements: { count: 0, amount: 0 },
  methodCorrections: 0,
  paymentReverts: 0,
  nonCash: [],
  cash: null,
};

/**
 * Panel cek tutup shift (Smart Notification V2, Tahap 1.7): semua pengecualian di
 * satu tempat sebelum laci dihitung. Hanya informasi — tutup shift tidak diblokir.
 * Ikon + teks (tidak hanya warna). Kasir tidak pernah melihat kas tunai di sini.
 */
export function ShiftCloseCheckPanel({
  cashSessionId,
  activeTableCount,
  pendingQrCount,
}: {
  cashSessionId: string | null;
  activeTableCount: number;
  pendingQrCount: number;
}) {
  const [data, setData] = useState<ShiftCloseCheckData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!cashSessionId) return;
    let alive = true;
    garageApi
      .get<ShiftCloseCheckData>(`/api/finance/cash-sessions/${encodeURIComponent(cashSessionId)}/close-check`, { cache: "no-store" })
      .then((next) => {
        if (alive) setData(next);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [cashSessionId]);

  const result = useMemo(
    () => shiftCloseCheckItems(data ?? EMPTY, { activeTables: activeTableCount, pendingQr: pendingQrCount }),
    [data, activeTableCount, pendingQrCount],
  );
  const loading = Boolean(cashSessionId) && !data && !failed;

  return (
    <section
      aria-label="Cek sebelum tutup shift"
      className={`space-y-2 rounded-lg border p-3 ${
        result.ready && !loading ? "border-[#34343c] bg-white/[0.04]" : "border-[#f5a742]/45 bg-[#f5a742]/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">Cek sebelum tutup shift</p>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#d6d6dc]">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memuat…
          </span>
        ) : result.ready ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#e7e9ee]">
            <CheckCircle2 className="size-3.5" aria-hidden /> Siap ditutup
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#ffd08a]">
            <AlertTriangle className="size-3.5" aria-hidden /> {result.warnCount} perlu dicek
          </span>
        )}
      </div>
      {failed ? (
        <p className="text-xs leading-5 text-[#ffd08a]">Ringkasan shift gagal dimuat — cek manual transaksi belum lunas & kas keluar/masuk.</p>
      ) : null}
      <ul className="space-y-1.5">
        {result.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-xs leading-5">
            {item.level === "warn" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#ffd08a]" aria-label="Perlu dicek" />
            ) : (
              <Info className="mt-0.5 size-3.5 shrink-0 text-[#b8b8bf]" aria-label="Info" />
            )}
            <span className="min-w-0">
              <span className={`block font-semibold ${item.level === "warn" ? "text-white" : "text-[#e7e9ee]"}`}>{item.title}</span>
              <span className="block text-[#d0d0d6]">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
