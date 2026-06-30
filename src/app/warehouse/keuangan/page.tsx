"use client";

import { useEffect, useState } from "react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";

type Finance = {
  kpis: { inventoryValue: number; avgFoodCost: number; totalMaterials: number; totalRecipes: number };
  recipes: Array<{ id: string; name: string; category: string; sellPrice: number; cogs: number; foodCostPct: number; margin: number }>;
  materials: Array<{ id: string; sku: string; name: string; unit: string; hpp: number }>;
};

function foodCostColor(pct: number) {
  if (pct <= 30) return "#16A34A";
  if (pct <= 38) return "#D97706";
  return "#DC2626";
}

export default function WmsKeuanganPage() {
  const [data, setData] = useState<Finance | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<Finance>("/api/wms/finance");
        if (alive) setData(d);
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className="text-[13px] text-[#6B7280]">Memuat…</p>;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Keuangan &amp; HPP</h1>
        <p className="text-[13px] text-[#6B7280]">HPP, food cost, dan margin — terhitung otomatis dari harga bahan (auto-sync).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Nilai Modal Inventory" value={currency.format(k.inventoryValue)} />
        <Kpi label="Avg Food Cost" value={`${k.avgFoodCost}%`} color={foodCostColor(k.avgFoodCost)} />
        <Kpi label="Bahan Terdaftar" value={String(k.totalMaterials)} />
        <Kpi label="Resep" value={String(k.totalRecipes)} sub="Auto-Sync ✓" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* HPP & margin per resep */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-[#111111]">HPP &amp; Margin per Resep</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E8] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <th className="py-2 pr-2">Resep</th>
                  <th className="py-2 px-2 text-right">COGS</th>
                  <th className="py-2 px-2 text-right">Jual</th>
                  <th className="py-2 px-2 text-right">Food Cost</th>
                  <th className="py-2 pl-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.recipes.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-[#6B7280]">Belum ada resep.</td></tr>
                ) : (
                  data.recipes.map((r) => (
                    <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                      <td className="py-2 pr-2 font-semibold text-[#111111]">{r.name}</td>
                      <td className="py-2 px-2 text-right font-mono text-[#6B7280]">{currency.format(r.cogs)}</td>
                      <td className="py-2 px-2 text-right font-mono text-[#111111]">{currency.format(r.sellPrice)}</td>
                      <td className="py-2 px-2 text-right">
                        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `${foodCostColor(r.foodCostPct)}22`, color: foodCostColor(r.foodCostPct) }}>
                          {r.foodCostPct}%
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right font-mono font-bold text-[#16A34A]">{currency.format(r.margin)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Master modal bahan */}
        <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <h2 className="mb-3 text-[14px] font-bold text-[#111111]">Master Modal Bahan</h2>
          <div className="garage-scroll-y max-h-[420px] space-y-1.5 overflow-y-auto">
            {data.materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-[#F0F1F4] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[#111111]">{m.name}</span>
                  <span className="block font-mono text-[10.5px] text-[#C8102E]">{m.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[13px] font-bold text-[#111111]">{currency.format(Math.round(m.hpp))}</span>
                  <span className="block text-[10px] text-[#9CA3AF]">/ {m.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <p className="font-mono text-[22px] font-extrabold" style={{ color: color ?? "#111111" }}>{value}</p>
      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] font-semibold text-[#16A34A]">{sub}</p>}
    </div>
  );
}
