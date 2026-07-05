"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Sparkles } from "lucide-react";

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

type PoDraft = {
  poNumber: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unit: string;
    orderedQty: number;
    hpp: number;
  }>;
};

export default function WmsReorderPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: ReorderItem[]; totalSuggestions: number } | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);

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

  async function generatePoDraft() {
    setPoLoading(true);
    setPoError(null);
    try {
      const draft = await garageApi.post<PoDraft>("/api/wms/reorder/po-draft", {});
      if (!draft.items.length) {
        setPoError("Tidak ada item dengan saran qty > 0.");
        return;
      }
      sessionStorage.setItem("wms-po-draft", JSON.stringify(draft));
      router.push("/warehouse/receiving");
    } catch (err) {
      setPoError(err instanceof Error ? err.message : "Gagal membuat draft PO.");
    } finally {
      setPoLoading(false);
    }
  }

  const actionable = data?.items.filter((i) => i.suggestedQty > 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#2F3136] p-4 text-white">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#f5a742]">
          <Sparkles className="size-4" /> Smart 2026 · AI Insight
        </p>
        <h1 className="mt-1 text-[20px] font-extrabold">Smart Reorder</h1>
        <p className="text-[13px] text-white/70">
          Saran restock dari rata-rata konsumsi 30 hari + target cover sesuai Settings WMS.
          {data ? ` ${data.totalSuggestions} item perlu perhatian.` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={poLoading || actionable === 0}
            onClick={() => void generatePoDraft()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C8102E] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(200,16,46,.25)] hover:bg-[#a50d25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilePlus2 className="size-4" />
            {poLoading ? "Membuat PO…" : `Generate PO (${actionable} item)`}
          </button>
          {poError ? <span className="text-[12px] text-[#FCA5A5]">{poError}</span> : null}
        </div>
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
