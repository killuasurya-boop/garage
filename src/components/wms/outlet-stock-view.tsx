"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Boxes, PackageX } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import { WMS_STATUS_COLOR, type WmsProductRow, type WmsWarehouse } from "@/lib/wms-types";

type Movement = {
  id: string;
  type: string;
  qty: number;
  valueHpp: number;
  refDoc: string;
  productName: string;
  createdAt: string;
};

const MOVE_LABEL: Record<string, string> = {
  in: "Masuk",
  out: "Keluar",
  internal_out: "Dipakai",
  transfer: "Transfer",
  waste: "Waste",
  adjustment: "Koreksi",
};

/** Tampilan stok + konsumsi untuk satu gudang outlet (dapur/bar). */
export function OutletStockView({ whType, title, subtitle }: { whType: "kitchen" | "bar"; title: string; subtitle: string }) {
  const [wh, setWh] = useState<WmsWarehouse | null>(null);
  const [rows, setRows] = useState<WmsProductRow[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const whs = await garageApi.get<WmsWarehouse[]>("/api/wms/warehouses");
        const outlet = whs.find((w) => w.type === whType);
        if (!outlet) { if (alive) { setNotFound(true); setLoading(false); } return; }
        if (alive) setWh(outlet);
        const [prods, rep] = await Promise.all([
          garageApi.get<WmsProductRow[]>(`/api/wms/products?warehouse=${outlet.id}`),
          garageApi.get<{ movements: Movement[] }>(`/api/wms/reports?warehouse=${outlet.id}`),
        ]);
        if (!alive) return;
        setRows(prods.filter((p) => p.onHand > 0));
        setMoves(rep.movements.slice(0, 20));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [whType]);

  const low = rows.filter((r) => r.status === "low" || r.status === "out").length;
  const value = Math.round(rows.reduce((s, r) => s + r.onHand * r.hpp, 0));

  if (notFound) return <p className="text-[13px] text-[#6B7280]">Gudang outlet {title} belum tersedia.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">{title}</h1>
        <p className="text-[13px] text-[#6B7280]">{subtitle}{wh ? ` · ${wh.code}` : ""}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={<Boxes className="size-4 text-[#2563EB]" />} label="Jenis bahan" value={String(rows.length)} />
        <Kpi icon={<AlertTriangle className="size-4 text-[#f5a742]" />} label="Perlu restock" value={String(low)} />
        <Kpi icon={<PackageX className="size-4 text-[#16A34A]" />} label="Nilai stok" value={currency.format(value)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-[#E8E8E8] bg-white">
          <p className="border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]">Stok di {title}</p>
          <div className="max-h-[440px] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Belum ada stok. Kirim bahan lewat Internal Order / Transfer.</p>
            ) : (
              rows.map((r) => {
                const sc = WMS_STATUS_COLOR[r.status];
                return (
                  <div key={r.id} className="flex items-center justify-between border-b border-[#F0F1F4] px-4 py-2.5 last:border-0">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111111]">{r.name}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{r.sku} · {r.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-bold text-[#111111]">{r.onHand} <span className="text-[11px] font-normal text-[#9CA3AF]">{r.unit}</span></span>
                      <span className="rounded-full px-1.5 py-px text-[9.5px] font-bold" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[#E8E8E8] bg-white">
          <p className="border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]">Pergerakan terbaru</p>
          <div className="max-h-[440px] overflow-y-auto">
            {moves.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#6B7280]">Belum ada pergerakan.</p>
            ) : (
              moves.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-[#F0F1F4] px-4 py-2 last:border-0 text-[12.5px]">
                  <div>
                    <p className="font-semibold text-[#111111]">{m.productName}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{new Date(m.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })} · {m.refDoc}</p>
                  </div>
                  <span className={`font-mono font-bold ${m.qty < 0 ? "text-[#C8102E]" : "text-[#16A34A]"}`}>
                    {m.qty > 0 ? "+" : ""}{m.qty} <span className="text-[10px] font-normal text-[#9CA3AF]">{MOVE_LABEL[m.type] ?? m.type}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">{icon} {label}</div>
      <p className="mt-1 text-[18px] font-extrabold text-[#111111]">{value}</p>
    </div>
  );
}
