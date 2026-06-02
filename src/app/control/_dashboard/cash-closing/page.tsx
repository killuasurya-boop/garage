"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ceo/layout/PageHeader";
import { Panel } from "@/components/ceo/layout/Panel";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Wallet,
} from "lucide-react";

type ShiftRow = {
  id: string;
  code: string;
  status: string;
  businessDate?: string;
  shiftNumber?: number;
  shiftLabel?: string;
  cashierName: string;
  outletCode?: string;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus: string;
  managerSignOffAt: string | null;
  openedAt: string;
  closedAt: string | null;
};

type DailyReport = {
  date: string;
  rows: ShiftRow[];
  totals: {
    shifts: number;
    orders: number;
    paidOrders: number;
    gross: number;
    cash: number;
    nonCash: number;
    expectedCash: number;
    actualCash: number;
    discrepancy: number;
  };
};

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (Math.abs(n) >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return idr.format(n);
};
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function CashClosingPage() {
  const [date, setDate] = useState(todayKey);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/cash-sessions/daily?date=${date}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: DailyReport };
      setReport(json.data ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat shift");
    }
  }, [date]);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      await refresh();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const summary = useMemo(() => {
    const rows = report?.rows ?? [];
    return {
      open: rows.filter((r) => r.status === "open").length,
      closed: rows.filter((r) => r.status === "closed").length,
      pendingApproval: rows.filter(
        (r) => r.status === "closed" && r.discrepancy !== 0 && r.discrepancyStatus !== "approved",
      ).length,
      totalDiscrepancy: rows.reduce((s, r) => s + r.discrepancy, 0),
    };
  }, [report]);

  const approveDiscrepancy = async (id: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/finance/cash-sessions/${id}/approve-discrepancy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Disetujui dari Pusat Kontrol" }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 120)}`);
      }
      setMsg("Selisih disetujui.");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Approval gagal");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Cash Closing"
        title="Tutup Shift Harian"
        subtitle="Pantau open / closed shift, selisih kas, dan approval owner."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-2 py-1.5 text-xs text-zinc-100"
            />
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--garage-bg-2)] px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-200 hover:bg-[var(--garage-bg-3)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Segarkan
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-xs text-[#ffb1b1]">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_12%,transparent)] p-3 text-xs text-[#a8f0c4]">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Shift Open"
          value={summary.open}
          icon={<Unlock className="h-4 w-4" />}
          tone={summary.open > 0 ? "amber" : "success"}
        />
        <Kpi
          label="Shift Closed"
          value={summary.closed}
          icon={<Lock className="h-4 w-4" />}
          tone="chrome"
        />
        <Kpi
          label="Perlu Approval"
          value={summary.pendingApproval}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={summary.pendingApproval > 0 ? "red" : "success"}
        />
        <Kpi
          label="Total Discrepancy"
          value={compact(summary.totalDiscrepancy)}
          icon={<Wallet className="h-4 w-4" />}
          tone={Math.abs(summary.totalDiscrepancy) > 0 ? "amber" : "success"}
        />
      </div>

      <Panel
        title="Daftar Shift Hari Ini"
        subtitle={`${report?.rows.length ?? 0} shift · Total kas masuk ${compact(report?.totals.cash ?? 0)} · Non-cash ${compact(report?.totals.nonCash ?? 0)}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Shift</th>
                <th className="py-2 pr-3 font-semibold">Kasir</th>
                <th className="py-2 pr-3 font-semibold">Buka</th>
                <th className="py-2 pr-3 font-semibold">Tutup</th>
                <th className="py-2 pr-3 font-semibold text-right">Expected</th>
                <th className="py-2 pr-3 font-semibold text-right">Actual</th>
                <th className="py-2 pr-3 font-semibold text-right">Selisih</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-zinc-500">
                    Memuat shift…
                  </td>
                </tr>
              )}
              {!loading && (report?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-zinc-500">
                    Tidak ada shift pada tanggal ini.
                  </td>
                </tr>
              )}
              {report?.rows.map((r) => {
                const needsApproval =
                  r.status === "closed" && r.discrepancy !== 0 && r.discrepancyStatus !== "approved";
                return (
                  <tr key={r.id} className="text-zinc-200">
                    <td className="py-2 pr-3 font-mono text-zinc-300">
                      {r.code}
                      {r.shiftLabel ? (
                        <span className="ml-1 text-[10px] text-zinc-500">· {r.shiftLabel}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{r.cashierName}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">
                      {timeFmt.format(new Date(r.openedAt))}
                    </td>
                    <td className="py-2 pr-3 font-mono text-zinc-400">
                      {r.closedAt ? timeFmt.format(new Date(r.closedAt)) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{compact(r.expectedCash)}</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {r.actualCash != null ? compact(r.actualCash) : "—"}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono ${
                        r.discrepancy === 0
                          ? "text-zinc-400"
                          : r.discrepancy > 0
                            ? "text-[#a8f0c4]"
                            : "text-[#ffb1b1]"
                      }`}
                    >
                      {r.discrepancy === 0 ? "—" : compact(r.discrepancy)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.status === "open" ? (
                        <Badge tone="amber">Open</Badge>
                      ) : needsApproval ? (
                        <Badge tone="red">Selisih ditinjau</Badge>
                      ) : r.discrepancyStatus === "approved" ? (
                        <Badge tone="success">Disetujui</Badge>
                      ) : (
                        <Badge tone="chrome">Closed</Badge>
                      )}
                    </td>
                    <td className="py-2">
                      {needsApproval ? (
                        <button
                          type="button"
                          onClick={() => void approveDiscrepancy(r.id)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_18%,transparent)] px-2 py-1 text-[10px] font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_28%,transparent)] disabled:opacity-60"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {busyId === r.id ? "Memproses…" : "Setujui"}
                        </button>
                      ) : r.discrepancyStatus === "approved" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Total Harian" subtitle="Agregasi semua shift pada tanggal ini">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Row label="Gross Sales" value={compact(report?.totals.gross ?? 0)} />
          <Row label="Order Paid" value={String(report?.totals.paidOrders ?? 0)} />
          <Row label="Kas Masuk" value={compact(report?.totals.cash ?? 0)} />
          <Row label="Non-Cash" value={compact(report?.totals.nonCash ?? 0)} />
          <Row label="Expected Cash" value={compact(report?.totals.expectedCash ?? 0)} />
          <Row label="Actual Cash" value={compact(report?.totals.actualCash ?? 0)} />
          <Row
            label="Selisih Total"
            value={compact(report?.totals.discrepancy ?? 0)}
            tone={
              (report?.totals.discrepancy ?? 0) === 0
                ? "muted"
                : (report?.totals.discrepancy ?? 0) > 0
                  ? "success"
                  : "red"
            }
          />
          <Row label="Total Shift" value={String(report?.totals.shifts ?? 0)} />
        </div>
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
  value: number | string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "success" | "chrome";
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <p className="mt-1 font-[var(--garage-font-display)] text-2xl font-black text-zinc-50">{value}</p>
      <Badge tone={tone} className="mt-2">
        {tone === "red" ? "perhatian" : tone === "amber" ? "perlu cek" : "aman"}
      </Badge>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "red";
}) {
  const cls = {
    muted: "text-zinc-200",
    success: "text-[#a8f0c4]",
    red: "text-[#ffb1b1]",
  }[tone];
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
      <p className="text-[10px] font-semibold uppercase text-zinc-400">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold ${cls}`}>{value}</p>
    </div>
  );
}
