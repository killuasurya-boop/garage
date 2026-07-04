"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, ExternalLink } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";

type Summary = {
  inventoryValue: number;
  lowStockTotal: number;
  byWarehouse: Array<{ code: string; name: string; type: string; area: string; value: number; lowCount: number; outCount: number }>;
  outletAlerts: Array<{ warehouse: string; area: string; items: Array<{ name: string; unit: string; onHand: number; min: number; status: "low" | "out" }> }>;
};

/**
 * Widget ringkas WMS untuk modul OS (Dashboard/Finance/KDS/POS). Menarik
 * /api/wms/summary secara non-blocking (gagal/401/kosong → tak menampilkan apa-apa).
 * variant "card" = kartu nilai+alert; "banner" = peringatan tipis bahan menipis.
 */
export function WmsAlertWidget({ variant = "card", area }: { variant?: "card" | "banner"; area?: "bar" | "dapur" }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    let alive = true;
    void garageApi.get<Summary>("/api/wms/summary").then((d) => { if (alive) setS(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!s) return null;

  const alerts = area ? s.outletAlerts.filter((x) => x.area === area) : s.outletAlerts;
  const lowCount = alerts.reduce((n, x) => n + x.items.length, 0);

  if (variant === "banner") {
    if (lowCount === 0) return null;
    const names = alerts.flatMap((a) => a.items).slice(0, 4).map((i) => i.name).join(", ");
    return (
      <Link href="/warehouse" className="flex items-center gap-2 rounded-lg border border-[#f5a742]/40 bg-[#f5a742]/12 px-3 py-2 text-[12.5px] text-[#ffd79a] hover:bg-[#f5a742]/20">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate"><b>{lowCount} bahan menipis</b>{names ? ` — ${names}${lowCount > 4 ? ", …" : ""}` : ""}</span>
        <ExternalLink className="size-3.5 shrink-0" />
      </Link>
    );
  }

  return (
    <Link href="/warehouse" className="flex items-center justify-between gap-3 rounded-lg border border-[#34343c] bg-[#17171c] px-4 py-3 hover:border-[#f5a742]/40">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-[#C8102E]/15 text-[#ff9aa6]"><Boxes className="size-5" /></span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8f8f99]">Gudang (WMS)</p>
          <p className="text-[15px] font-extrabold text-white">{currency.format(s.inventoryValue)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-[13px] font-bold ${lowCount > 0 ? "text-[#ffd79a]" : "text-[#7fd7a3]"}`}>{lowCount > 0 ? `${lowCount} perlu restock` : "Stok aman ✓"}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#8f8f99]">Buka Warehouse <ExternalLink className="size-3" /></p>
      </div>
    </Link>
  );
}
