"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";

type Analytics = {
  kpis: { avgFoodCost: number; avgMargin: number; totalRecipes: number; wasteValue: number };
  topMaterials: Array<{ name: string; value: number }>;
  recipes: Array<{ id: string; name: string; sellPrice: number; cogs: number; foodCostPct: number; margin: number }>;
};

function foodCostColor(pct: number) {
  return pct <= 30 ? "#16A34A" : pct <= 38 ? "#D97706" : "#DC2626";
}

export default function WmsAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<Analytics>("/api/wms/analytics");
        if (alive) setData(d);
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-[#111111]">
          <TrendingUp className="size-6 text-[#7C3AED]" /> Owner Analytics
        </h1>
        <p className="text-[13px] text-[#6B7280]">Food cost, margin, waste, dan bahan paling banyak dikonsumsi.</p>
      </div>

      {!data ? (
        <p className="text-[13px] text-[#6B7280]">Memuat…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Avg Food Cost" value={`${data.kpis.avgFoodCost}%`} color={foodCostColor(data.kpis.avgFoodCost)} />
            <Kpi label="Avg Margin" value={currency.format(data.kpis.avgMargin)} color="#16A34A" />
            <Kpi label="Total Resep" value={String(data.kpis.totalRecipes)} />
            <Kpi label="Nilai Waste" value={currency.format(data.kpis.wasteValue)} color={data.kpis.wasteValue > 0 ? "#DC2626" : undefined} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
            <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
              <h2 className="mb-3 text-[14px] font-bold text-[#111111]">Bahan Terboros (30 hari)</h2>
              {data.topMaterials.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[#6B7280]">Belum ada konsumsi.</p>
              ) : (
                <div className="space-y-2">
                  {data.topMaterials.map((m, i) => {
                    const max = data.topMaterials[0].value || 1;
                    return (
                      <div key={m.name + i}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="font-semibold text-[#111111]">{m.name}</span>
                          <span className="font-mono text-[#6B7280]">{currency.format(m.value)}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#EEF0F3]">
                          <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${Math.round((m.value / max) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                    <th className="px-3 py-2.5">Resep</th>
                    <th className="px-3 py-2.5 text-right">Jual</th>
                    <th className="px-3 py-2.5 text-right">HPP</th>
                    <th className="px-3 py-2.5 text-right">Food Cost</th>
                    <th className="px-3 py-2.5 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recipes.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6B7280]">Belum ada resep.</td></tr>
                  ) : (
                    data.recipes.map((r) => (
                      <tr key={r.id} className="border-b border-[#F0F1F4] last:border-0">
                        <td className="px-3 py-2 font-semibold text-[#111111]">{r.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#6B7280]">{currency.format(r.sellPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#6B7280]">{currency.format(r.cogs)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: foodCostColor(r.foodCostPct) }}>{r.foodCostPct}%</td>
                        <td className="px-3 py-2 text-right font-mono text-[#16A34A]">{currency.format(r.margin)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <p className="font-mono text-[22px] font-extrabold" style={{ color: color ?? "#111111" }}>{value}</p>
      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">{label}</p>
    </div>
  );
}
