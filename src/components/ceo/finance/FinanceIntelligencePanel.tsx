"use client";

import { useReducedMotion } from "framer-motion";
import { ArrowLeft, Copy, Download, FileSpreadsheet, FileText, Save, Sheet, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import type { PeriodKey } from "@/lib/finance-control-core";
import type { ScenarioInput, ScenarioResult } from "@/lib/finance-intelligence-core";
import type { FinanceIntelligence } from "@/lib/finance-intelligence";
import { SafeResponsiveContainer } from "../charts/SafeResponsiveContainer";
import { EmptyNote, FinanceCard } from "./FinanceCards";
import { axisShort, percent, rupiah, signedPercent } from "./finance-format";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari" },
  { key: "this_month", label: "Bulan ini" },
  { key: "last_month", label: "Bulan lalu" },
  { key: "this_year", label: "Tahun ini" },
];

const REPORTS: Array<{ type: string; label: string }> = [
  { type: "daily", label: "Laporan keuangan harian" },
  { type: "pnl", label: "Laba rugi (P&L)" },
  { type: "cashflow", label: "Cashflow" },
  { type: "expense", label: "Expense" },
  { type: "payroll", label: "Payroll" },
  { type: "hpp", label: "HPP" },
  { type: "bep", label: "BEP" },
  { type: "capital", label: "Capital recovery" },
  { type: "product", label: "Profitabilitas produk" },
];

const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[var(--garage-focus-ring)]";
const axisTick = { fill: "#b4b4bd", fontSize: 12 };

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-xl px-3.5 text-sm font-bold transition active:scale-[0.98] ${
        active
          ? "bg-[var(--garage-active-bg)] text-white ring-1 ring-[color-mix(in_srgb,var(--garage-red)_60%,transparent)]"
          : "text-zinc-300 hover:bg-white/8"
      }`}
    >
      {children}
    </button>
  );
}

function ProjectedBadge() {
  return (
    <span className="rounded-full border border-[color-mix(in_srgb,var(--garage-amber)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_16%,transparent)] px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-[#ffd8a8]">
      Proyeksi
    </span>
  );
}

export function FinanceIntelligencePanel() {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [horizon, setHorizon] = useState(6);
  const [result, setResult] = useState<{ key: string; data: FinanceIntelligence } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = `${period}:${horizon}:${nonce}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/finance/intelligence?period=${period}&horizon=${horizon}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message ?? "Gagal memuat.");
        setResult({ key, data: json.data });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Gagal memuat.");
      });
    return () => controller.abort();
  }, [period, horizon, key]);

  const data = result?.data ?? null;
  const loading = result?.key !== key;
  const motion = { isAnimationActive: !reduce, animationDuration: 800 };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/control/financial" className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-300 hover:text-zinc-50">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard keuangan
          </Link>
          <h1 className="mt-1 font-[var(--garage-font-display)] text-3xl font-black uppercase text-zinc-50">Financial Intelligence</h1>
          <p className="text-sm text-zinc-300">CEO brief, profitabilitas produk, forecast, simulasi What-If, dan export laporan.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-[var(--garage-bg-1)] p-1.5" role="tablist" aria-label="Periode">
          {PERIODS.map((p) => (
            <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </Pill>
          ))}
        </div>
      </div>

      {error ? <EmptyNote text={error} /> : null}
      {!data && !error ? <div className="h-72 animate-pulse rounded-2xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" /> : null}

      {data ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <BriefCard brief={data.brief} onRefresh={() => setNonce((n) => n + 1)} />
            <ProductCard data={data} motion={motion} className="xl:col-span-2" />
          </div>

          <FinanceCard
            title="Forecast"
            subtitle="Run-rate 30 hari terakhir + tren; biaya tetap dari master data"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ProjectedBadge />
                {[1, 3, 6, 12].map((h) => (
                  <Pill key={h} active={horizon === h} onClick={() => setHorizon(h)}>
                    {h} bln
                  </Pill>
                ))}
              </div>
            }
          >
            <ForecastBody data={data} motion={motion} />
          </FinanceCard>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <ScenarioCard data={data} onSaved={() => setNonce((n) => n + 1)} className="xl:col-span-3" />
            <ExportCard period={period} className="xl:col-span-2 xl:self-start" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── CEO brief ──────────────────────────────────────────────────────────────

function BriefCard({ brief, onRefresh }: { brief: FinanceIntelligence["brief"]; onRefresh: () => void }) {
  return (
    <FinanceCard
      title="CEO Financial Brief"
      subtitle="Ringkasan siap kirim"
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(brief.text).then(() => toast.success("Brief disalin."));
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold uppercase text-zinc-100 hover:bg-white/15"
          >
            <Copy className="h-4 w-4" aria-hidden /> Salin
          </button>
          <button type="button" onClick={onRefresh} className="min-h-9 rounded-lg px-3 text-xs font-bold uppercase text-zinc-300 hover:bg-white/10">
            Muat ulang
          </button>
        </>
      }
    >
      <div className="max-h-[420px] overflow-y-auto rounded-xl bg-black/30 p-4 ring-1 ring-white/8">
        {brief.lines.map((line, index) =>
          line === "" ? (
            <div key={index} className="h-2" />
          ) : (
            <p
              key={index}
              className={`text-sm leading-relaxed ${
                index === 0
                  ? "font-[var(--garage-font-display)] text-base font-black uppercase text-zinc-50"
                  : index === 1
                    ? "text-xs font-bold uppercase text-[var(--garage-amber)]"
                    : line.startsWith("Main attention")
                      ? "font-bold text-[#ffd8a8]"
                      : "text-zinc-200"
              }`}
            >
              {line}
            </p>
          ),
        )}
      </div>
    </FinanceCard>
  );
}

// ─── Product profitability ──────────────────────────────────────────────────

function ProductCard({
  data,
  motion,
  className,
}: {
  data: FinanceIntelligence;
  motion: { isAnimationActive: boolean; animationDuration: number };
  className?: string;
}) {
  const { products } = data;
  const top = products.rows.filter((row) => row.contribution !== null).slice(0, 8);
  return (
    <FinanceCard
      title="Product Profitability"
      subtitle={`${data.period.label} · kontribusi total ${rupiah(products.totals.contribution)}`}
      className={className}
    >
      {products.rows.length ? (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
          <div style={{ height: Math.max(180, top.length * 36) }}>
            {top.length ? (
              <SafeResponsiveContainer>
                <BarChart data={top} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={130} tick={{ ...axisTick, fill: "#e4e4e7" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    animationDuration={180}
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as (typeof top)[number];
                      return (
                        <div className="rounded-xl border border-white/12 bg-[var(--garage-bg-1)] p-3 text-xs shadow-xl">
                          <p className="font-bold text-zinc-50">{row.name}</p>
                          <p className="mt-1 text-zinc-300">Kontribusi {rupiah(row.contribution)}</p>
                          <p className="text-zinc-300">Margin {percent(row.marginPct)} · {row.qty} terjual</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="contribution" radius={[0, 6, 6, 0]} maxBarSize={22} {...motion}>
                    {top.map((row, index) => (
                      <Cell key={row.key} fill={index === 0 ? "var(--garage-red-bright)" : index < 3 ? "var(--garage-red)" : "#7a2a2a"} />
                    ))}
                  </Bar>
                </BarChart>
              </SafeResponsiveContainer>
            ) : (
              <EmptyNote text="Belum ada produk ber-resep yang terjual — kontribusi belum bisa dihitung." />
            )}
          </div>
          <div className="max-h-[360px] overflow-auto rounded-xl ring-1 ring-white/8">
            <table className="w-full min-w-[560px] whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-[var(--garage-bg-3)] text-[11px] uppercase text-zinc-300">
                <tr>
                  <th className="px-2 py-2 text-left">Produk</th>
                  <th className="px-2 py-2 text-right">Harga</th>
                  <th className="px-2 py-2 text-right">HPP</th>
                  <th className="px-2 py-2 text-right">Margin</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Kontribusi</th>
                </tr>
              </thead>
              <tbody>
                {products.rows.map((row) => (
                  <tr key={row.key} className="border-t border-white/8">
                    <td className="px-2 py-1.5 text-zinc-100">{row.name}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{rupiah(row.sellingPrice)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {row.hasRecipe ? rupiah(row.unitHpp) : <span className="text-xs text-[#ffd8a8]">tanpa resep</span>}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${row.marginPct !== null && row.marginPct < 50 ? "text-[#ffd8a8]" : ""}`}>
                      {percent(row.marginPct)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.qty}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">{rupiah(row.contribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyNote text="Belum ada penjualan pada periode ini." />
      )}
      {products.totals.withoutRecipe ? (
        <p className="mt-3 text-xs text-[#ffd8a8]">
          {products.totals.withoutRecipe} produk terjual belum punya resep berharga — kontribusinya tidak dihitung.
        </p>
      ) : null}
    </FinanceCard>
  );
}

// ─── Forecast ───────────────────────────────────────────────────────────────

function ForecastBody({ data, motion }: { data: FinanceIntelligence; motion: { isAnimationActive: boolean; animationDuration: number } }) {
  const f = data.forecast;
  const a = f.assumptions;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="h-[280px] min-w-[520px]">
            <SafeResponsiveContainer>
              <ComposedChart data={f.months} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.split(" ")[0].slice(0, 3)} />
                <YAxis tickFormatter={axisShort} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                <Tooltip
                  animationDuration={180}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const m = payload[0].payload as (typeof f.months)[number];
                    return (
                      <div className="rounded-xl border border-white/12 bg-[var(--garage-bg-1)] p-3 text-xs shadow-xl">
                        <p className="font-bold uppercase text-[#ffd8a8]">{m.label} · proyeksi</p>
                        <p className="mt-1 text-zinc-200">Revenue {rupiah(m.revenue)}</p>
                        <p className="text-zinc-200">HPP {rupiah(m.cogs)}</p>
                        <p className="text-zinc-200">Biaya tetap {rupiah(m.fixedCost)}</p>
                        <p className="font-bold text-zinc-50">Net profit {rupiah(m.netProfit)}</p>
                        <p className="text-zinc-400">Modal kembali {percent(m.recoveryPct)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#c9c9cf" fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={30} {...motion} />
                <Line type="monotone" dataKey="netProfit" name="Net profit" stroke="var(--garage-red-bright)" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 3 }} {...motion} />
              </ComposedChart>
            </SafeResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">Batang = revenue proyeksi, garis putus-putus = net profit proyeksi. Tidak dicampur dengan angka aktual.</p>
      </div>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Revenue / hari", rupiah(a.avgDailyRevenue)],
            ["Tren / bulan", `${signedPercent(a.monthlyGrowthPct)}${a.growthSource === "flat" ? " (flat)" : ""}`],
            ["HPP / revenue", percent(a.cogsRatioPct)],
            ["Biaya tetap / hari", rupiah(a.fixedCostDaily)],
            [`Revenue ${f.horizon} bln`, rupiah(f.totals.revenue)],
            [`Net profit ${f.horizon} bln`, rupiah(f.totals.netProfit)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/8">
              <p className="text-[11px] font-semibold uppercase text-zinc-400">{label}</p>
              <p className="font-mono text-sm font-bold tabular-nums text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
        <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-zinc-200">
          {f.paybackMonth === "sudah"
            ? "Modal sudah kembali."
            : f.paybackMonth
              ? `Dengan asumsi ini, modal kembali sekitar ${f.months.find((m) => m.month === f.paybackMonth)?.label ?? f.paybackMonth}.`
              : `Modal belum kembali dalam ${f.horizon} bulan proyeksi.`}
        </p>
        {f.notes.map((note) => (
          <p key={note} className="text-xs text-[#ffd8a8]">
            ⚠ {note}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── What-If ────────────────────────────────────────────────────────────────

const SLIDERS: Array<{ key: keyof ScenarioInput; label: string }> = [
  { key: "revenuePct", label: "Revenue" },
  { key: "hppPct", label: "HPP per porsi" },
  { key: "payrollPct", label: "Payroll" },
  { key: "advertisingPct", label: "Iklan" },
  { key: "expensePct", label: "Biaya operasional lain" },
];

function ScenarioCard({ data, onSaved, className }: { data: FinanceIntelligence; onSaved: () => void; className?: string }) {
  const [params, setParams] = useState<ScenarioInput>({ revenuePct: 0, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 });
  const [basePeriod, setBasePeriod] = useState<PeriodKey>("this_month");
  const [scenario, setScenario] = useState<(ScenarioResult & { period: { label: string } }) | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const body = useMemo(() => JSON.stringify({ period: basePeriod, params }), [basePeriod, params]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/finance/scenario", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal })
        .then((r) => r.json())
        .then((json) => json.data && setScenario(json.data))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/finance/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: basePeriod, params, name }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Gagal menyimpan.");
      toast.success("Skenario disimpan.");
      setName("");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/finance/scenario/${id}`, { method: "DELETE" });
    if (response.ok) {
      toast.success("Skenario dihapus.");
      onSaved();
    } else toast.error("Gagal menghapus skenario.");
  }

  const rows: Array<[string, keyof ScenarioResult["actual"]]> = [
    ["Revenue", "revenue"],
    ["HPP", "cogs"],
    ["Payroll", "payroll"],
    ["Iklan", "advertising"],
    ["Biaya operasional lain", "otherExpense"],
    ["Net profit", "netProfit"],
    ["BEP (simulasi)", "bep"],
  ];

  return (
    <FinanceCard title="What-If Simulator" subtitle="Skenario tidak mengubah transaksi aktual" actions={<ProjectedBadge />} className={className}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
        Basis aktual:
        {(["7d", "this_month", "last_month"] as PeriodKey[]).map((p) => (
          <Pill key={p} active={basePeriod === p} onClick={() => setBasePeriod(p)}>
            {p === "7d" ? "7 hari" : p === "this_month" ? "Bulan ini" : "Bulan lalu"}
          </Pill>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="space-y-4">
          {SLIDERS.map((s) => (
            <label key={s.key} className="block">
              <span className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-zinc-200">{s.label}</span>
                <span className={`font-mono font-bold tabular-nums ${params[s.key] > 0 ? "text-[#ffd8a8]" : params[s.key] < 0 ? "text-[#a8f0c4]" : "text-zinc-400"}`}>
                  {signedPercent(params[s.key])}
                </span>
              </span>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={params[s.key]}
                onChange={(e) => setParams((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
                className="h-2 w-full cursor-pointer accent-[var(--garage-red-bright)]"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => setParams({ revenuePct: 0, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 })}
            className="min-h-9 rounded-lg px-3 text-xs font-bold uppercase text-zinc-300 hover:bg-white/10"
          >
            Reset
          </button>
        </div>
        <div className="min-w-0">
          {scenario ? (
            <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td:not(:first-child)]:whitespace-nowrap [&_td:not(:first-child)]:pl-3">
              <thead className="text-[11px] uppercase text-zinc-400">
                <tr>
                  <th className="py-1.5 text-left">{scenario.period.label}</th>
                  <th className="py-1.5 text-right">Aktual</th>
                  <th className="py-1.5 text-right">Proyeksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, key]) => (
                  <tr key={key} className={`border-t border-white/8 ${key === "netProfit" ? "font-bold text-zinc-50" : "text-zinc-200"}`}>
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{rupiah(scenario.actual[key] as number | null)}</td>
                    <td className={`py-1.5 text-right font-mono tabular-nums ${key === "netProfit" && (scenario.projected.netProfit ?? 0) < 0 ? "text-[#ffb1b1]" : ""}`}>
                      {rupiah(scenario.projected[key] as number | null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="h-48 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none" />
          )}
          {scenario ? (
            <p className="mt-2 text-xs text-zinc-400">
              Selisih net profit {rupiah(scenario.delta.netProfit)} · net margin proyeksi {percent(scenario.projected.netMarginPct)}. HPP ikut naik-turun
              bersama volume revenue.
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <input className={input} placeholder="Nama skenario, mis. Promo akhir bulan" value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              disabled={saving || name.trim().length < 2}
              onClick={() => void save()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--garage-red)] px-3 text-sm font-bold text-white hover:bg-[var(--garage-red-bright)] disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden /> Simpan
            </button>
          </div>
        </div>
      </div>
      {data.scenarios.length ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-400">Skenario tersimpan</p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {data.scenarios.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm">
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-zinc-100 hover:underline"
                  onClick={() => {
                    const p = s.params as Partial<ScenarioInput> & { period?: PeriodKey };
                    setParams({
                      revenuePct: p.revenuePct ?? 0,
                      hppPct: p.hppPct ?? 0,
                      payrollPct: p.payrollPct ?? 0,
                      advertisingPct: p.advertisingPct ?? 0,
                      expensePct: p.expensePct ?? 0,
                    });
                    if (p.period) setBasePeriod(p.period);
                  }}
                >
                  {s.name}
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-zinc-300">NP {rupiah(s.netProfit)}</span>
                  <button type="button" aria-label={`Hapus ${s.name}`} onClick={() => void remove(s.id)} className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-[#ffb1b1]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </FinanceCard>
  );
}

// ─── Export laporan (PRD §55) ───────────────────────────────────────────────

function ExportCard({ period, className }: { period: PeriodKey; className?: string }) {
  const [type, setType] = useState("pnl");
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: "pdf" | "xlsx" | "csv") {
    setBusy(format);
    try {
      const response = await fetch("/api/finance/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format, period }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Gagal membuat laporan.");
      }
      const blob = await response.blob();
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `laporan.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`${filename} diunduh.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat laporan.");
    } finally {
      setBusy(null);
    }
  }

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;
  return (
    <FinanceCard title="Export laporan" subtitle={`Periode: ${periodLabel} (ikuti filter di atas)`} className={className}>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-bold uppercase text-zinc-300">Jenis laporan</span>
        <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
          {REPORTS.map((r) => (
            <option key={r.type} value={r.type}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {(
          [
            ["pdf", "PDF", FileText],
            ["xlsx", "Excel", FileSpreadsheet],
            ["csv", "CSV", Sheet],
          ] as const
        ).map(([format, label, Icon]) => (
          <button
            key={format}
            type="button"
            disabled={busy !== null}
            onClick={() => void download(format)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98] disabled:opacity-50"
          >
            {busy === format ? <Download className="h-4 w-4 animate-bounce motion-reduce:animate-none" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
            {busy === format ? "Membuat…" : label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-400">Angka laporan = angka dashboard (engine yang sama). Hari yang sudah di-closing memakai angka terkunci.</p>
    </FinanceCard>
  );
}
