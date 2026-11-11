"use client";

// Dashboard Owner/Manajer: ringkasan Partner Hub (hanya tampil bila Partner Hub aktif di outlet & ada mitra).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Handshake } from "lucide-react";

type Summary =
  | { enabled: false }
  | {
      enabled: true;
      partners: Array<{ partnerId: string; name: string; operationalStatus: string; todaySales: number; monthSales: number }>;
      draftCount: number;
      openCount: number;
      todaySales: number;
      monthSales: number;
      monthProfit: number;
      approvedUnpaid: number;
      activeOrders: number;
      needsRefund: number;
    };

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

export function PartnerDashboardWidget({ role }: { role: string }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    if (role !== "Owner" && role !== "Manajer") return;
    let cancelled = false;
    fetch("/api/partners/dashboard", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: Summary } | null) => {
        if (!cancelled && json?.data) setData(json.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role]);
  if (!data || !data.enabled || (data.partners.length === 0 && data.draftCount === 0)) return null;
  return (
    <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4" aria-labelledby="pdw-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pdw-title" className="flex items-center gap-2 text-base font-bold text-white">
          <Handshake className="size-4 text-[#f5a742]" /> Partner Hub
        </h2>
        <Link href="/partners?tab=finance" className="inline-flex min-h-11 items-center rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
          Buka Keuangan Mitra
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item label="Penjualan mitra hari ini" value={rp(data.todaySales)} />
        <Item label="Penjualan bulan ini" value={rp(data.monthSales)} />
        <Item label="Profit Garage bulan ini" value={rp(data.monthProfit)} tone={data.monthProfit < 0 ? "red" : "green"} />
        <Item label="Setoran belum dibayar" value={rp(data.approvedUnpaid)} tone={data.approvedUnpaid > 0 ? "amber" : undefined} />
      </dl>
      <p className="mt-2 text-sm text-[#d4d4d8]">
        {data.openCount}/{data.partners.length} mitra BUKA · {data.activeOrders} pesanan berjalan
        {data.needsRefund ? <span className="font-semibold text-[#ff8a95]"> · {data.needsRefund} perlu refund</span> : null}
        {data.draftCount ? <span className="text-[#ffd08a]"> · {data.draftCount} mitra belum aktif</span> : null}
      </p>
    </section>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" | "amber" }) {
  const color = tone === "red" ? "text-[#ff8a95]" : tone === "green" ? "text-[#86efac]" : tone === "amber" ? "text-[#ffd08a]" : "text-white";
  return (
    <div className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
      <dt className="text-xs text-[#b8b8bf]">{label}</dt>
      <dd className={`mt-1 text-base font-black tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
