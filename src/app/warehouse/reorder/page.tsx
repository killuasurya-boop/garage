"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { garageApi } from "@/lib/api-client";

type ReorderItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  minStock: number;
  avgDaily: number;
  daysCover: number | null;
  suggestedQty: number;
  urgency: "critical" | "low" | "ok";
};

export default function WmsReorderPage() {
  const [data, setData] = useState<{ items: ReorderItem[]; totalSuggestions: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<{ items: ReorderItem[]; totalSuggestions: number }>("/api/wms/reorder");
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
    <div className="space-y-4">
      <div className="rounded-xl bg-[#2F3136] p-4 text-white">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#f5a742]">
          <Sparkles className="size-4" /> Smart 2026 · AI Insight
        </p>
        <h1 className="mt-1 text-[20px] font-extrabold">Smart Reorder</h1>
        <p className="text-[13px] text-white/70">
          Saran restock dari rata-rata konsumsi 30 hari + target cover 14 hari.
          {data ? ` ${data.totalSuggestions} item perlu perhatian.` : ""}
        </p>
      </div>

      {!data ? (
        <p className="text-[13px] text-[#6B7280]">Memuat…</p>
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-[#E8E8E8] bg-white p-8 text-center text-[13px] text-[#16A34A]">Semua stok cukup — tidak ada saran reorder 👍</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                <th className="px-3 py-2.5">Produk</th>
                <th className="px-3 py-2.5 text-right">Stok</th>
                <th className="px-3 py-2.5 text-right">Konsumsi/hari</th>
                <th className="px-3 py-2.5 text-right">Cukup (hari)</th>
                <th className="px-3 py-2.5 text-right">Saran Beli</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => {
                const c = i.urgency === "critical" ? "#DC2626" : i.urgency === "low" ? "#D97706" : "#16A34A";
                return (
                  <tr key={i.id} className="border-b border-[#F0F1F4] last:border-0" style={{ background: i.urgency === "critical" ? "#FEF4F4" : undefined }}>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold text-[#111111]">{i.name}</span>
                      <span className="font-mono text-[11px] text-[#C8102E]">{i.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#111111]">{i.onHand} <span className="text-[11px] text-[#9CA3AF]">{i.unit}</span></td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#6B7280]">{i.avgDaily}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: c }}>{i.daysCover != null ? i.daysCover : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-extrabold text-[#111111]">{i.suggestedQty}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${c}1f`, color: c }}>
                        {i.urgency === "critical" ? "Kritis" : i.urgency === "low" ? "Menipis" : "Cukup"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
