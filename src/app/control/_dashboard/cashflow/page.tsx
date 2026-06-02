"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import { Banknote, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";

type ForecastShape = {
  windowDays: number;
  today: { revenue: number; expense: number; net: number };
  avg7: { revenue: number; expense: number };
  avg30: { revenue: number; expense: number };
  dailyNet7: number;
  dailyNet30: number;
  due: { within7: number; within30: number };
  forecast: { proj7Net: number; proj30Net: number };
  trend: Array<{ date: string; revenue: number; expense: number; net: number }>;
};

type FinanceOverview = {
  today: {
    revenue: number;
    expense: number;
    netProfit: number;
    cashCollected: number;
    nonCashCollected: number;
  };
  trend?: Array<{ date: string; revenue: number; expense: number }>;
  cashOnHand?: number;
};

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (Math.abs(n) >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return idr.format(n);
};

export default function CashflowForecastPage() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [server, setServer] = useState<ForecastShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      // Endpoint baru (server-side forecast).
      const fcRes = await fetch("/api/finance/forecast").catch(() => null);
      if (fcRes && fcRes.ok) {
        const json = (await fcRes.json()) as { data?: ForecastShape };
        setServer(json.data ?? null);
      }
      const res = await fetch("/api/finance/overview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: FinanceOverview };
      setOverview(json.data ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat finance");
    }
  };

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Prioritaskan hasil server (server-side forecast). Fallback: hitung client-side.
  const forecast = useMemo(() => {
    if (server) {
      const cashOnHand = overview?.cashOnHand ?? overview?.today.cashCollected ?? 0;
      const runwayDays =
        server.dailyNet7 < 0 && cashOnHand > 0
          ? Math.floor(cashOnHand / Math.abs(server.dailyNet7))
          : null;
      return {
        avgRevenue: server.avg7.revenue,
        avgExpense: server.avg7.expense,
        dailyNet: server.dailyNet7,
        proj7: server.forecast.proj7Net,
        proj30: server.forecast.proj30Net,
        dueWithin7: server.due.within7,
        dueWithin30: server.due.within30,
        cashOnHand,
        runwayDays,
      };
    }
    const trend = overview?.trend ?? [];
    const today = overview?.today;
    if (!today) return null;

    const avgRevenue =
      trend.length > 0
        ? trend.slice(-7).reduce((s, t) => s + t.revenue, 0) / Math.min(trend.length, 7)
        : today.revenue;
    const avgExpense =
      trend.length > 0
        ? trend.slice(-7).reduce((s, t) => s + t.expense, 0) / Math.min(trend.length, 7)
        : today.expense;

    const dailyNet = avgRevenue - avgExpense;
    const proj7 = dailyNet * 7;
    const proj30 = dailyNet * 30;
    const cashOnHand = overview.cashOnHand ?? today.cashCollected;
    const runwayDays = dailyNet < 0 && cashOnHand > 0 ? Math.floor(cashOnHand / Math.abs(dailyNet)) : null;
    return {
      avgRevenue,
      avgExpense,
      dailyNet,
      proj7,
      proj30,
      dueWithin7: 0,
      dueWithin30: 0,
      cashOnHand,
      runwayDays,
    };
  }, [overview, server]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Cash Flow"
        title="Forecast 7 / 30 Hari"
        subtitle="Proyeksi kas masuk vs keluar berbasis rata-rata 7 hari terakhir."
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Segarkan
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-xs text-[#ffb1b1]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Kas Hari Ini"
          value={compact(forecast?.cashOnHand ?? 0)}
          icon={<Wallet className="h-4 w-4" />}
          tone="chrome"
        />
        <Kpi
          label="Net / Hari (avg 7h)"
          value={compact(forecast?.dailyNet ?? 0)}
          icon={(forecast?.dailyNet ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          tone={(forecast?.dailyNet ?? 0) >= 0 ? "success" : "red"}
        />
        <Kpi
          label="Proyeksi 7 Hari"
          value={compact(forecast?.proj7 ?? 0)}
          icon={<Banknote className="h-4 w-4" />}
          tone={(forecast?.proj7 ?? 0) >= 0 ? "success" : "red"}
        />
        <Kpi
          label="Proyeksi 30 Hari"
          value={compact(forecast?.proj30 ?? 0)}
          icon={<Banknote className="h-4 w-4" />}
          tone={(forecast?.proj30 ?? 0) >= 0 ? "success" : "red"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Ringkasan Hari Ini" subtitle="Source: /api/finance/overview" className="lg:col-span-2">
          {loading && <p className="text-xs text-zinc-500">Memuat…</p>}
          {!loading && !overview && <p className="text-xs text-zinc-500">Data finance tidak tersedia.</p>}
          {overview && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Row label="Revenue" value={compact(overview.today.revenue)} tone="success" />
              <Row label="Expense" value={compact(overview.today.expense)} tone="red" />
              <Row label="Net Profit" value={compact(overview.today.netProfit)} tone={overview.today.netProfit >= 0 ? "success" : "red"} />
              <Row label="Cash Collected" value={compact(overview.today.cashCollected)} tone="chrome" />
              <Row label="Non-Cash Collected" value={compact(overview.today.nonCashCollected)} tone="chrome" />
              <Row
                label="Avg Revenue 7h"
                value={compact(forecast?.avgRevenue ?? 0)}
                tone="success"
              />
              <Row label="Avg Expense 7h" value={compact(forecast?.avgExpense ?? 0)} tone="red" />
            </div>
          )}
        </Panel>

        <Panel title="Runway" subtitle="Estimasi kas habis bila tren saat ini berlanjut">
          {!forecast || forecast.dailyNet >= 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--garage-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_10%,transparent)] p-4 text-xs text-[#a8f0c4]">
              <strong className="font-[var(--garage-font-display)] text-base">Aman</strong>
              <p>Net harian positif — kas bertambah seiring waktu, tidak ada perhitungan runway.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-4 text-xs text-[#ffb1b1]">
              <strong className="font-[var(--garage-font-display)] text-base">
                {forecast.runwayDays != null ? `${forecast.runwayDays} hari` : "—"}
              </strong>
              <p>
                Bila tren 7 hari terakhir bertahan, kas habis dalam waktu di atas. Pertimbangkan
                tindakan: kurangi expense kategori terbesar, percepat collection, atau tunda kewajiban
                non-kritis.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {server && (
        <Panel title="Kewajiban Jatuh Tempo" subtitle="Supplier invoices belum lunas dalam 7 / 30 hari">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_10%,transparent)] p-4">
              <p className="text-[10px] font-semibold uppercase text-zinc-400">Due ≤ 7 hari</p>
              <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-[#ffd8a8]">
                {compact(server.due.within7)}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">sudah dikurangi dari proyeksi 7 hari</p>
            </div>
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_10%,transparent)] p-4">
              <p className="text-[10px] font-semibold uppercase text-zinc-400">Due ≤ 30 hari</p>
              <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-[#ffb1b1]">
                {compact(server.due.within30)}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">sudah dikurangi dari proyeksi 30 hari</p>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Catatan Forecast" subtitle="Penjelasan metodologi">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Model v1 memakai rata-rata 7 hari terakhir untuk net harian, dikalikan 7 dan 30 untuk
          proyeksi. Tidak memperhitungkan musiman, kewajiban besar yang jatuh tempo, atau
          collection delay. Akan diganti model server-side yang memperhitungkan supplier_invoices
          jatuh tempo, payroll cycle, dan trend seasonality saat backend forecast siap.
        </p>
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "success" | "chrome";
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-xl font-black text-zinc-50">{value}</p>
      <Badge tone={tone} className="mt-2">
        forecast
      </Badge>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "amber" | "success" | "chrome";
}) {
  const toneClass = {
    red: "text-[#ffb1b1]",
    amber: "text-[#ffd8a8]",
    success: "text-[#a8f0c4]",
    chrome: "text-zinc-200",
  }[tone];
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[var(--garage-bg-3)] px-3 py-2">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
