"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Banknote, CalendarRange, Gauge, Lock, RefreshCw, Settings2, Sparkles, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { FinanceControlDashboard as Dashboard } from "@/lib/finance-control";
import { BEP_STATUS_LABEL, longDayLabel, type PeriodKey } from "@/lib/finance-control-core";
import {
  AlertsCard,
  BepMeterCard,
  CapitalRecoveryCard,
  CashOutGroups,
  FinanceCard,
  FinancialHealthCard,
  InsightCard,
  KpiTile,
  PayrollBudgetCard,
  ProfitLossCard,
  EmptyNote,
} from "./FinanceCards";
import { CashflowChart, ChannelBars, ExpenseBars, ExpenseDonut, ProfitTrendChart, RevenueBepChart } from "./FinanceCharts";
import { rupiah } from "./finance-format";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari" },
  { key: "this_month", label: "Bulan ini" },
  { key: "last_month", label: "Bulan lalu" },
  { key: "this_year", label: "Tahun ini" },
  { key: "custom", label: "Kustom" },
];

function greeting() {
  const hour = new Date(Date.now() + 7 * 3_600_000).getUTCHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export function FinanceControlDashboard() {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Dashboard | null; error: string | null } | null>(null);

  const query = useMemo(() => {
    if (period === "custom" && (!custom.from || !custom.to)) return null;
    const params = new URLSearchParams({ period });
    if (period === "custom") {
      params.set("from", custom.from);
      params.set("to", custom.to);
    }
    return params.toString();
  }, [period, custom.from, custom.to]);
  const requestKey = query ? `${query}#${nonce}` : null;

  useEffect(() => {
    if (!query || !requestKey) return;
    const controller = new AbortController();
    fetch(`/api/finance/dashboard?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message ?? "Gagal memuat dashboard.");
        setResult({ key: requestKey, data: json.data as Dashboard, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult((prev) => ({
          key: requestKey,
          data: prev?.data ?? null,
          error: err instanceof Error ? err.message : "Gagal memuat dashboard.",
        }));
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const data = result?.data ?? null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const load = useCallback(() => setNonce((n) => n + 1), []);

  const bepTone = !data?.kpis.bep.status ? "neutral" : data.kpis.bep.status === "ABOVE" ? "ok" : data.kpis.bep.status === "NEAR" ? "warn" : "bad";
  const cashTone =
    data?.kpis.cash.status === "AMAN" ? "ok" : data?.kpis.cash.status === "PERHATIAN" ? "warn" : data?.kpis.cash.status === "KRITIS" ? "bad" : "neutral";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--garage-amber)]">Garage Financial Control</p>
          <h1 className="font-[var(--garage-font-display)] text-3xl font-black uppercase text-zinc-50 sm:text-4xl">
            {greeting()}, CEO
          </h1>
          <p className="mt-1 text-sm text-zinc-300">
            {data ? `${longDayLabel(data.todayKey)} · periode ${data.period.label}` : "Memuat kondisi keuangan Garage…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading && !reduce ? "animate-spin" : ""}`} aria-hidden />
            Muat ulang
          </button>
          <Link
            href="/control/financial/intelligence"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Intelligence
          </Link>
          <Link
            href="/control/financial/closing"
            className="relative inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98]"
          >
            <Lock className="h-4 w-4" aria-hidden />
            Closing
            {data?.closing.pendingPastDays.length ? (
              <span className="rounded-full bg-[var(--garage-amber)] px-1.5 text-xs font-black text-black">
                {data.closing.pendingPastDays.length}
              </span>
            ) : null}
          </Link>
          <Link
            href="/control/financial/settings"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--garage-red)] px-3 text-sm font-bold text-white shadow-[var(--garage-shadow-button)] transition hover:bg-[var(--garage-red-bright)] active:scale-[0.98]"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Pengaturan
          </Link>
        </div>
      </div>

      {/* Filter global (PRD §33) */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[var(--garage-bg-1)] p-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Periode">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={period === item.key}
              onClick={() => setPeriod(item.key)}
              className={`min-h-10 rounded-xl px-3.5 text-sm font-bold transition active:scale-[0.98] ${
                period === item.key
                  ? "bg-[var(--garage-active-bg)] text-white shadow-[var(--garage-glow-primary)] ring-1 ring-[color-mix(in_srgb,var(--garage-red)_60%,transparent)]"
                  : "text-zinc-300 hover:bg-white/8 hover:text-zinc-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <CalendarRange className="h-4 w-4 text-zinc-400" aria-hidden />
            <label className="sr-only" htmlFor="fc-from">Dari</label>
            <input
              id="fc-from"
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(event) => setCustom((c) => ({ ...c, from: event.target.value }))}
              className="min-h-10 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2 text-sm text-zinc-100 [color-scheme:dark]"
            />
            <span className="text-zinc-400">–</span>
            <label className="sr-only" htmlFor="fc-to">Sampai</label>
            <input
              id="fc-to"
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(event) => setCustom((c) => ({ ...c, to: event.target.value }))}
              className="min-h-10 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2 text-sm text-zinc-100 [color-scheme:dark]"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--garage-red)_50%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_14%,transparent)] p-4 text-sm text-[#ffc2c8]">
          {error}
        </div>
      ) : null}

      {period === "custom" && (!custom.from || !custom.to) ? (
        <EmptyNote icon={CalendarRange} text="Pilih tanggal mulai dan selesai untuk periode kustom." />
      ) : null}

      {!data && loading ? <DashboardSkeleton /> : null}

      <AnimatePresence mode="wait">
        {data ? (
          <motion.div
            key={`${data.period.key}-${data.period.fromKey}-${data.period.toKey}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: loading ? 0.6 : 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
            aria-busy={loading}
          >
            {/* KPI (PRD §21) — mobile: Revenue → Net Profit → Cash → BEP */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile label="Revenue" icon={TrendingUp} value={data.kpis.revenue.value} change={data.kpis.revenue.changePct} footnote="Net sales (tanpa pajak)" />
              <KpiTile
                label="Net Profit"
                icon={Wallet}
                value={data.kpis.netProfit.value}
                change={data.kpis.netProfit.changePct}
                footnote={data.pnl.netMarginPct !== null ? `Net margin ${data.pnl.netMarginPct}%` : "Belum ada penjualan"}
              />
              <KpiTile
                label="Cash"
                icon={Banknote}
                value={data.kpis.cash.value}
                status={data.kpis.cash.status}
                statusTone={cashTone}
                footnote={
                  data.kpis.cash.status === "BELUM DISET"
                    ? "Isi saldo kas awal di Pengaturan"
                    : data.kpis.cash.runwayDays !== null
                      ? `Cukup ±${data.kpis.cash.runwayDays} hari biaya`
                      : undefined
                }
              />
              <KpiTile
                label="BEP"
                icon={Gauge}
                format="percent"
                value={data.kpis.bep.achievementPct}
                status={data.kpis.bep.status ? BEP_STATUS_LABEL[data.kpis.bep.status] : "Belum terhitung"}
                statusTone={bepTone}
                footnote={data.kpis.bep.target ? `Target ${rupiah(data.kpis.bep.target)}` : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <FinanceCard
                title="Revenue vs BEP"
                subtitle={data.hourly ? "Kumulatif per jam" : `${data.period.label} · ${data.period.granularity === "month" ? "per bulan" : "per hari"}`}
                className="xl:col-span-2"
              >
                <RevenueBepChart data={data} />
              </FinanceCard>
              <BepMeterCard data={data} />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <FinanceCard title="Profit Trend" subtitle={data.hourly ? "7 hari terakhir" : data.period.label}>
                <ProfitTrendChart data={data} />
              </FinanceCard>
              <FinanceCard title="Cashflow" subtitle={data.hourly ? "7 hari terakhir" : data.period.label}>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Kas awal", data.cashflow.opening],
                    ["Cash in", data.cashflow.cashIn],
                    ["Cash out", data.cashflow.cashOut],
                    ["Kas akhir", data.cashflow.closing],
                  ].map(([label, value]) => (
                    <div key={label as string} className="min-w-0 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/8">
                      <p className="text-[11px] font-semibold uppercase text-zinc-400">{label}</p>
                      <p className="font-mono text-sm font-bold tabular-nums text-zinc-100">{rupiah(value as number)}</p>
                    </div>
                  ))}
                </div>
                {data.cashflow.capitalIn > 0 ? (
                  <p className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
                    Cash in termasuk setoran modal {rupiah(data.cashflow.capitalIn)}. Cashflow operasional:{" "}
                    <span className="font-mono font-bold text-zinc-100">{rupiah(data.cashflow.operatingNet)}</span>.
                  </p>
                ) : null}
                <CashflowChart data={data} />
              </FinanceCard>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <CapitalRecoveryCard data={data} />
              <FinanceCard title="Expense" subtitle={`Komposisi biaya · ${data.period.label}`}>
                {data.expenses.lines.length ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <ExpenseBars data={data} />
                    <ExpenseDonut data={data} />
                  </div>
                ) : (
                  <EmptyNote text="Belum ada biaya tercatat pada periode ini." />
                )}
              </FinanceCard>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <FinancialHealthCard data={data} />
              <InsightCard insights={data.insights} />
              <AlertsCard alerts={data.alerts} />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <ProfitLossCard data={data} />
              <PayrollBudgetCard data={data} />
              <FinanceCard title="Channel & Uang Keluar" subtitle={data.period.label}>
                {data.channels.length ? <ChannelBars data={data} /> : <EmptyNote text="Belum ada pembayaran masuk." />}
                <p className="mt-5 text-xs font-bold uppercase text-zinc-400">Cash out per kelompok</p>
                <CashOutGroups data={data} />
                {!data.cashflow.outByGroup.length ? <p className="mt-2 text-sm text-zinc-400">Belum ada pengeluaran.</p> : null}
              </FinanceCard>
            </div>

            <p className="text-center text-xs text-zinc-500">
              Semua angka dihitung server-side dari POS, resep, Payroll V2, dan expense · diperbarui{" "}
              {new Date(data.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DashboardSkeleton() {
  const block = "animate-pulse rounded-2xl border border-white/8 bg-[var(--garage-bg-2)] motion-reduce:animate-none";
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${block} h-[150px]`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className={`${block} h-[380px] xl:col-span-2`} />
        <div className={`${block} h-[380px]`} />
      </div>
    </div>
  );
}
