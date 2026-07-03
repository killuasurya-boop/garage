"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  PackageX,
  Wallet,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsDashboard } from "@/lib/wms-types";

export default function WmsDashboardPage() {
  const searchParams = useSearchParams();
  const wh = searchParams.get("wh") ?? "";
  const [data, setData] = useState<WmsDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await garageApi.get<WmsDashboard>(wh ? `/api/wms/dashboard?warehouse=${wh}` : "/api/wms/dashboard");
        if (alive) setData(d);
      } catch {
        if (alive) setErr("Gagal memuat dashboard.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [wh]);

  if (err) return <p className="text-sm text-[#DC2626]">{err}</p>;
  if (!data) return <p className="text-sm text-[#6B7280]">Memuat dashboard…</p>;

  const k = data.kpis;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Dashboard Gudang</h1>
        <p className="text-[13px] text-[#6B7280]">Ringkasan stok, nilai inventory, dan pergerakan hari ini.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Total Item Aktif" value={String(k.totalProducts)} tone="graphite" />
        <Kpi icon={Wallet} label="Nilai Inventory (HPP)" value={currency.format(k.stockValue)} tone="graphite" />
        <Kpi icon={AlertTriangle} label="Low Stock" value={String(k.lowStock)} tone="amber" pulse={k.lowStock > 0} />
        <Kpi icon={PackageX} label="Out of Stock" value={String(k.outOfStock)} tone="red" pulse={k.outOfStock > 0} />
      </div>

      {/* Chart 60 / Alerts 40 */}
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Pergerakan Stok · 7 Hari">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #E8E8E8", fontSize: 12 }}
                  labelStyle={{ color: "#111", fontWeight: 700 }}
                />
                <Area type="monotone" dataKey="masuk" name="Masuk" stroke="#16A34A" strokeWidth={2} fill="url(#gIn)" />
                <Area type="monotone" dataKey="keluar" name="Keluar" stroke="#C8102E" strokeWidth={2} fill="url(#gOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-[#6B7280]">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#16A34A]" /> Masuk</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#C8102E]" /> Keluar</span>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[#C8102E]">
                <span className="size-2 animate-pulse rounded-full bg-[#C8102E]" /> LIVE
              </span>
              Alerts
            </span>
          }
        >
          {data.alerts.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#6B7280]">Semua stok aman 👍</p>
          ) : (
            <div className="space-y-2">
              {data.alerts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-md border-l-[3px] bg-[#F8F9FB] px-3 py-2 text-[12.5px] text-[#111111]"
                  style={{ borderLeftColor: a.level === "out" ? "#DC2626" : "#D97706" }}
                >
                  {a.text}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent + Quick */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Transaksi Terbaru">
          {data.recentMovements.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#6B7280]">Belum ada pergerakan stok.</p>
          ) : (
            <div className="divide-y divide-[#F0F1F4]">
              {data.recentMovements.map((m) => {
                const inbound = m.qty > 0;
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-md"
                      style={{ background: inbound ? "#DCFCE7" : "#FEE2E2" }}
                    >
                      {inbound ? (
                        <ArrowDownLeft className="size-4 text-[#16A34A]" />
                      ) : (
                        <ArrowUpRight className="size-4 text-[#C8102E]" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#111111]">{m.productName}</span>
                      <span className="block text-[11px] text-[#6B7280]">
                        {m.type.toUpperCase()} · <span className="font-mono">{m.refDoc || "-"}</span>
                      </span>
                    </span>
                    <span className={`font-mono text-[13px] font-bold ${inbound ? "text-[#16A34A]" : "text-[#C8102E]"}`}>
                      {inbound ? "+" : ""}
                      {m.qty}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Aksi Cepat">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Terima Barang", soon: true },
              { label: "Internal Order", soon: true },
              { label: "Stock Opname", soon: true },
              { label: "Lihat Inventory", href: "/warehouse/inventory" },
            ].map((q) =>
              q.href ? (
                <a
                  key={q.label}
                  href={q.href}
                  className="rounded-lg border border-[#E8E8E8] bg-white px-3 py-4 text-center text-[13px] font-semibold text-[#111111] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
                >
                  {q.label}
                </a>
              ) : (
                <div
                  key={q.label}
                  className="cursor-not-allowed rounded-lg border border-dashed border-[#E8E8E8] bg-[#F8F9FB] px-3 py-4 text-center text-[13px] font-semibold text-[#9CA3AF]"
                  title="Fase berikutnya"
                >
                  {q.label}
                </div>
              ),
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  tone: "graphite" | "amber" | "red";
  pulse?: boolean;
}) {
  const color = tone === "amber" ? "#D97706" : tone === "red" ? "#DC2626" : "#2F3136";
  const bg = tone === "amber" ? "#FEF3C7" : tone === "red" ? "#FEE2E2" : "#EEF0F3";
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-lg" style={{ background: bg }}>
          <Icon className="size-[18px]" style={{ color }} />
        </span>
        {pulse && <span className="size-2.5 animate-pulse rounded-full" style={{ background: color }} />}
      </div>
      <p className="mt-3 font-mono text-[24px] font-extrabold leading-none" style={{ color: tone === "graphite" ? "#111111" : color }}>
        {value}
      </p>
      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">{label}</p>
    </div>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E8E8E8] bg-white p-4">
      <h2 className="mb-3 text-[14px] font-bold text-[#111111]">{title}</h2>
      {children}
    </section>
  );
}
