"use client";

// POS: jumlah pesanan mitra yang perlu perhatian kasir (belum diterima lewat SLA / siap tapi belum diambil),
// supaya kasir tidak perlu bolak-balik membuka Partner Hub. Polling ringan, hanya saat modul aktif.

import { useEffect, useState } from "react";

import { partnerOrdersNeedingAttention } from "@/lib/partner-hub-rules";

type Row = { status: string; createdAt: string; readyAt: string | null; claimedByName: string | null; needsRefund?: boolean };

export function usePartnerAttention(enabled: boolean, slaWarnMinutes: number, readyWarnMinutes: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/pos/partner-orders", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Row[] };
        if (!cancelled) setCount(partnerOrdersNeedingAttention(json.data ?? [], Date.now(), slaWarnMinutes, readyWarnMinutes));
      } catch {
        // Jaringan putus: badge lama dipertahankan, dicoba lagi di putaran berikut.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, slaWarnMinutes, readyWarnMinutes]);
  return enabled ? count : 0;
}
