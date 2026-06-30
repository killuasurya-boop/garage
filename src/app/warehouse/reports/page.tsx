"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";

type Reports = {
  kpis: { masuk: number; keluar: number; valueMasuk: number; valueKeluar: number; total: number };
  bars: Array<{ label: string; masuk: number; keluar: number }>;
  movements: Array<{ id: string; type: string; qty: number; valueHpp: number; refDoc: string; productName: string; warehouseName: string; createdAt: string }>;
};

const TYPES = ["all", "in", "out", "internal_out", "adjustment", "transfer", "waste"];

export default function WmsReportsPage() {
  const [data, setData] = useState<Reports | null>(null);
  const [type, setType] = useState("all");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<Reports>(`/api/wms/reports?type=${type}`);
        if (alive) setData(d);
      } catch {
        /* abaikan */
      }
    })();
    return () => {
      alive = false;
    };
  }, [type]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Reports · Pergerakan Stok</h1>
        <p className="text-[13px] text-[#6B7280]">Semua mutasi stok dari ledger (masuk, keluar, internal, koreksi).</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((tp) => (
          <button key={tp} type="button" onClick={() => setType(tp)} className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${type === tp ? "border-[#C8102E] bg-[#FDF1F3] text-[#C8102E]" : "border-[#E8E8E8] bg-white text-[#6B7280] hover:bg-[#F8F9FB]"}`}>
            {tp === "all" ? "Semua" : tp.toUpperCase()}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-[13px] text-[#6B7280]">Memuat…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total Masuk" value={String(data.kpis.masuk)} color="#16A34A" />
            <Kpi label="Total Keluar" value={String(data.kpis.keluar)} color="#C8102E" />
            <Kpi label="Nilai Keluar (HPP)" value={currency.format(data.kpis.valueKeluar)} />
            <Kpi label="Total Transaksi" value={String(data.kpis.total)} />
          </div>

          <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
            <h2 className="mb-3 text-[14px] font-bold text-[#111111]">Masuk vs Keluar per Hari</h2>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bars} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E8E8E8", fontSize: 12 }} />
                  <Bar dataKey="masuk" name="Masuk" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="keluar" name="Keluar" fill="#C8102E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <th className="px-3 py-2.5">Waktu</th>
                  <th className="px-3 py-2.5">Tipe</th>
                  <th className="px-3 py-2.5">Produk</th>
                  <th className="px-3 py-2.5">Gudang</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Nilai</th>
                  <th className="px-3 py-2.5">Ref</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-[#6B7280]">Belum ada pergerakan.</td></tr>
                ) : (
                  data.movements.map((m) => (
                    <tr key={m.id} className="border-b border-[#F0F1F4] last:border-0">
                      <td className="px-3 py-2 text-[11.5px] text-[#6B7280]">{new Date(m.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-[#F0F1F4] px-2 py-0.5 text-[10px] font-bold uppercase text-[#374151]">{m.type}</span></td>
                      <td className="px-3 py-2 font-semibold text-[#111111]">{m.productName}</td>
                      <td className="px-3 py-2 text-[#6B7280]">{m.warehouseName}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${m.qty > 0 ? "text-[#16A34A]" : "text-[#C8102E]"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#6B7280]">{currency.format(m.valueHpp)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[#9CA3AF]">{m.refDoc}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
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
