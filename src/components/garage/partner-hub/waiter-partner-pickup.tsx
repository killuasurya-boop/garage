"use client";

// Layar Waiter: pintu tetap ke "Ambil dari Mitra". Tampil bila ada pesanan mitra aktif (polling ringan).
// Merah bila ada pesanan Siap Antar yang belum diklaim waiter.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";

type Row = { status: string; claimedByName: string | null };

export function WaiterPartnerPickup() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/pos/partner-orders", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Row[] };
        if (!cancelled) setRows(json.data ?? []);
      } catch {
        // jaringan putus: pakai data terakhir
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  if (!rows || rows.length === 0) return null;
  const ready = rows.filter((row) => row.status === "ready" && !row.claimedByName).length;
  const inProgress = rows.filter((row) => row.status !== "ready" && row.status !== "rejected").length;
  return (
    <Link
      href="/partners?tab=pickup"
      className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2.5 ${
        ready ? "border-[#ff4d5e]/70 bg-[#d11a2a]/18" : "border-garage-line bg-garage-bg-1"
      }`}
    >
      <Handshake className={`size-5 shrink-0 ${ready ? "text-[#ff8a95]" : "text-[#f5a742]"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-white">Ambil dari Mitra</span>
        <span className="block text-[12px] text-[#d4d4d8]">
          {ready ? `${ready} pesanan siap diambil` : "Belum ada yang siap"}
          {inProgress ? ` · ${inProgress} sedang disiapkan mitra` : ""}
        </span>
      </span>
      {ready ? <span className="rounded-full bg-[#d11a2a] px-2.5 py-1 text-sm font-bold text-white">{ready}</span> : null}
    </Link>
  );
}
