"use client";

import { ArrowLeft, CheckCircle2, Lock, LockOpen, ShieldAlert, TriangleAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { ClosingOverview, DailyClosingReview, MonthlyClosingReview } from "@/lib/finance-closing";
import { BEP_STATUS_LABEL, shortDayLabel, type BepStatus } from "@/lib/finance-control-core";
import { DailyBankReportCard } from "./DailyBankReportCard";
import { EmptyNote, FinanceCard } from "./FinanceCards";
import { percent, rupiah } from "./finance-format";

type Check = DailyClosingReview["checks"][number];

const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[var(--garage-focus-ring)]";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-sm font-bold uppercase text-white shadow-[var(--garage-shadow-button)] transition hover:bg-[var(--garage-red-bright)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98] disabled:opacity-50";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message ?? "Permintaan gagal.");
  return json.data as T;
}

function CheckRow({ check }: { check: Check }) {
  const Icon = check.status === "ok" ? CheckCircle2 : check.status === "warn" ? TriangleAlert : XCircle;
  const color = check.status === "ok" ? "text-[#a8f0c4]" : check.status === "warn" ? "text-[#ffd8a8]" : "text-[#ffb1b1]";
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/8">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-bold text-zinc-50">{check.label}</p>
        <p className="text-sm text-zinc-300">{check.detail}</p>
      </div>
    </li>
  );
}

function StatusBanner({ closed, title, meta }: { closed: boolean; title: string; meta?: ReactNode }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${
        closed
          ? "border-[color-mix(in_srgb,var(--garage-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--garage-success)_12%,transparent)]"
          : "border-white/12 bg-white/[0.04]"
      }`}
    >
      {closed ? <Lock className="h-5 w-5 text-[#a8f0c4]" aria-hidden /> : <LockOpen className="h-5 w-5 text-zinc-300" aria-hidden />}
      <div className="min-w-0">
        <p className={`font-[var(--garage-font-display)] text-lg font-black uppercase ${closed ? "text-[#a8f0c4]" : "text-zinc-100"}`}>{title}</p>
        {meta ? <div className="text-xs text-zinc-300">{meta}</div> : null}
      </div>
    </div>
  );
}

function Money({ label, value, strong }: { label: string; value: number | null | undefined; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/8 py-2 last:border-0">
      <span className={`text-sm ${strong ? "font-bold text-zinc-50" : "text-zinc-300"}`}>{label}</span>
      <span className={`font-mono text-sm tabular-nums ${strong ? "font-bold" : ""} ${(value ?? 0) < 0 ? "text-[#ffb1b1]" : "text-zinc-100"}`}>
        {rupiah(value ?? 0)}
      </span>
    </div>
  );
}

// ─── Panel utama ────────────────────────────────────────────────────────────

export function FinanceClosingPanel() {
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [overview, setOverview] = useState<ClosingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    api<ClosingOverview>("/api/finance/closing")
      .then((data) => active && setOverview(data))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Gagal memuat status closing."));
    return () => {
      active = false;
    };
  }, [version]);

  const refreshOverview = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/control/financial" className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-300 hover:text-zinc-50">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard keuangan
          </Link>
          <h1 className="mt-1 font-[var(--garage-font-display)] text-3xl font-black uppercase text-zinc-50">Closing Keuangan</h1>
          <p className="text-sm text-zinc-300">Kunci angka harian & bulanan. Perubahan setelah dikunci hanya lewat buka ulang oleh Owner (tercatat di audit log).</p>
        </div>
        <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-[var(--garage-bg-1)] p-1.5" role="tablist">
          {(
            [
              ["daily", "Daily closing"],
              ["monthly", "Monthly closing"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-10 rounded-xl px-4 text-sm font-bold transition ${
                tab === key ? "bg-[var(--garage-active-bg)] text-white ring-1 ring-[color-mix(in_srgb,var(--garage-red)_60%,transparent)]" : "text-zinc-300 hover:bg-white/8"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <EmptyNote icon={ShieldAlert} text={error} /> : null}
      {!overview && !error ? <div className="h-40 animate-pulse rounded-2xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" /> : null}
      {overview ? (
        tab === "daily" ? (
          <DailyClosing overview={overview} onChanged={refreshOverview} />
        ) : (
          <MonthlyClosing overview={overview} onChanged={refreshOverview} />
        )
      ) : null}
    </div>
  );
}

// ─── Daily ──────────────────────────────────────────────────────────────────

function DailyClosing({ overview, onChanged }: { overview: ClosingOverview; onChanged: () => void }) {
  const defaultDate = overview.pendingPastDays.at(-1) ?? overview.todayKey;
  const [date, setDate] = useState(defaultDate);
  const [review, setReview] = useState<{ date: string; data: DailyClosingReview } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [notes, setNotes] = useState("");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<DailyClosingReview>(`/api/finance/closing/daily?date=${date}`)
      .then((data) => {
        if (!active) return;
        setReview({ date, data });
        setLoadError(null);
      })
      .catch((err: unknown) => active && setLoadError(err instanceof Error ? err.message : "Gagal memuat review."));
    return () => {
      active = false;
    };
  }, [date, nonce]);

  const data = review?.date === date ? review.data : null;

  async function run(action: () => Promise<DailyClosingReview>, success: string) {
    setBusy(true);
    try {
      const next = await action();
      setReview({ date, data: next });
      setNotes("");
      setAck(false);
      setReason("");
      toast.success(success);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Strip 14 hari */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 pb-1">
          {overview.daily.map((day) => {
            const selected = day.date === date;
            const tone = day.status === "closed" ? "bg-[var(--garage-success)]" : day.beforeStart ? "bg-zinc-600" : day.date < overview.todayKey ? "bg-[var(--garage-amber)]" : "bg-zinc-400";
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setDate(day.date)}
                aria-pressed={selected}
                className={`flex min-h-14 min-w-[76px] flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold transition active:scale-[0.98] ${
                  selected ? "border-[var(--garage-red-bright)] bg-[var(--garage-active-bg)] text-white" : "border-white/10 bg-[var(--garage-bg-2)] text-zinc-300 hover:bg-white/8"
                }`}
              >
                <span>{day.date === overview.todayKey ? "Hari ini" : shortDayLabel(day.date)}</span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${tone}`} />
                  {day.status === "closed" ? "Closed" : day.beforeStart ? "—" : day.status === "reopened" ? "Dibuka" : "Open"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex max-w-xs items-center gap-2 text-sm text-zinc-300">
        Tanggal lain
        <input type="date" className={`${input} [color-scheme:dark]`} max={overview.todayKey} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>

      {loadError ? <EmptyNote icon={ShieldAlert} text={loadError} /> : null}
      {!data && !loadError ? <div className="h-64 animate-pulse rounded-2xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" /> : null}

      {data ? (
        <>
          <StatusBanner
            closed={data.status === "closed"}
            title={data.status === "closed" ? `Day closed · ${data.label}` : `Daily closing · ${data.label}`}
            meta={
              data.status === "closed" && data.closing
                ? `Dikunci oleh ${data.closing.closedByName ?? "-"} · ${data.closing.closedAt ? new Date(data.closing.closedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}`
                : data.status === "reopened" && data.closing?.reopenReason
                  ? `Dibuka ulang: ${data.closing.reopenReason}`
                  : `${data.blocking} penahan · ${data.warnings} peringatan`
            }
          />

          {data.drift.length ? (
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--garage-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_12%,transparent)] p-4">
              <p className="text-sm font-bold text-[#ffd8a8]">Ada transaksi baru setelah closing — angka terkunci berbeda dengan data live.</p>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {data.drift.map((row) => (
                  <li key={row.key} className="flex justify-between gap-3 text-zinc-200">
                    <span>{row.label}</span>
                    <span className="font-mono tabular-nums">
                      {rupiah(row.locked)} → {rupiah(row.live)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-300">Owner dapat membuka ulang hari ini (adjustment) lalu closing kembali.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <FinanceCard title="Checklist closing" subtitle="POS → payment → kas → gudang → expense → payroll" className="xl:col-span-2">
              <ul className="space-y-2">
                {data.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            </FinanceCard>
            <FinanceCard title="Financial snapshot" subtitle={data.status === "closed" ? "Angka terkunci" : "Angka live saat ini"}>
              <Money label="Revenue (net sales)" value={data.figures.netSales} strong />
              <Money label="Biaya bahan (belanja gudang)" value={data.figures.cogs} />
              <Money label="Upah & payroll" value={data.figures.payroll} />
              <Money label="Biaya tetap & operasional" value={data.figures.operatingExpense} />
              <Money label="Net profit" value={data.figures.netProfit} strong />
              <Money label="Cash in" value={data.figures.cashIn} />
              <Money label="Cash out" value={data.figures.cashOut} />
              <p className="mt-2 text-xs text-zinc-400">
                {data.figures.orderCount} order · void {data.figures.voidCount} ({rupiah(data.figures.voidAmount)})
                {data.figures.hppCoveragePct !== null ? ` · HPP terukur ${percent(data.figures.hppCoveragePct)}` : ""}
              </p>
            </FinanceCard>
          </div>

          <DailyBankReportCard date={date} />

          <CashReconciliation data={data} onApproved={() => setNonce((n) => n + 1)} />

          {data.status === "closed" ? (
            <FinanceCard title="Buka ulang (adjustment)" subtitle="Hanya Owner. Alasan tercatat di audit log bersama angka lama & baru.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={input} placeholder="Alasan buka ulang (wajib)…" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy || reason.trim().length < 5 || data.monthClosed}
                  onClick={() =>
                    void run(
                      () => api("/api/finance/closing/daily/reopen", { method: "POST", body: JSON.stringify({ date, reason }) }),
                      "Hari dibuka ulang.",
                    )
                  }
                >
                  <LockOpen className="h-4 w-4" aria-hidden /> Buka ulang
                </button>
              </div>
              {data.monthClosed ? <p className="mt-2 text-xs text-[#ffd8a8]">Bulan ini sudah dikunci — buka ulang monthly closing dulu.</p> : null}
            </FinanceCard>
          ) : (
            <FinanceCard title="Close day" subtitle="Setelah dikunci, angka hari ini dibekukan untuk laporan.">
              <textarea aria-label="Catatan closing harian" className={`${input} min-h-20 py-2`} placeholder="Catatan closing (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              {data.warnings ? (
                <label className="mt-3 flex items-start gap-2 text-sm text-zinc-200">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--garage-red)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  Saya sudah mereview {data.warnings} peringatan pada checklist.
                </label>
              ) : null}
              {data.blocking ? (
                <p className="mt-3 text-sm text-[#ffb1b1]">Selesaikan {data.blocking} item bertanda ✕ sebelum closing.</p>
              ) : null}
              <button
                type="button"
                className={`${primaryBtn} mt-4 w-full sm:w-auto`}
                disabled={busy || data.blocking > 0 || (data.warnings > 0 && !ack) || data.monthClosed}
                onClick={() =>
                  void run(
                    () =>
                      api("/api/finance/closing/daily", {
                        method: "POST",
                        body: JSON.stringify({ date, notes: notes || undefined, acknowledgeWarnings: ack }),
                      }),
                    `${data.label} berhasil dikunci.`,
                  )
                }
              >
                <Lock className="h-4 w-4" aria-hidden /> {busy ? "Memproses…" : "Close day"}
              </button>
            </FinanceCard>
          )}
        </>
      ) : null}
    </div>
  );
}

function CashReconciliation({ data, onApproved }: { data: DailyClosingReview; onApproved: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api(`/api/finance/cash-sessions/${id}/approve-discrepancy`, {
        method: "PATCH",
        body: JSON.stringify({ note: notes[id] }),
      });
      toast.success("Selisih kas disetujui.");
      onApproved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal approve.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FinanceCard title="Cash reconciliation" subtitle="System cash vs actual cash per shift (PRD §44)">
      {data.cashSessions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase text-zinc-400">
                <th className="px-2 py-2">Shift</th>
                <th className="px-2 py-2 text-right">System cash</th>
                <th className="px-2 py-2 text-right">Actual cash</th>
                <th className="px-2 py-2 text-right">Variance</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Alasan / approval</th>
              </tr>
            </thead>
            <tbody>
              {data.cashSessions.map((row) => (
                <tr key={row.id} className="border-t border-white/8 align-middle">
                  <td className="px-2 py-2 font-mono text-zinc-100">{row.code}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{rupiah(row.expectedCash)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{rupiah(row.actualCash)}</td>
                  <td className={`px-2 py-2 text-right font-mono tabular-nums ${row.discrepancy < 0 ? "text-[#ffb1b1]" : row.discrepancy > 0 ? "text-[#ffd8a8]" : ""}`}>
                    {row.discrepancy > 0 ? "+" : ""}
                    {rupiah(row.discrepancy)}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                        row.needsInvestigation
                          ? "bg-[color-mix(in_srgb,var(--garage-red)_22%,transparent)] text-[#ffb1b1]"
                          : "bg-[color-mix(in_srgb,var(--garage-success)_16%,transparent)] text-[#a8f0c4]"
                      }`}
                    >
                      {row.needsInvestigation
                        ? "Perlu investigasi"
                        : row.discrepancyStatus === "ok"
                          ? "Cocok"
                          : row.discrepancyStatus === "minor"
                            ? "Selisih kecil"
                            : "Disetujui"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {row.needsInvestigation ? (
                      <div className="flex gap-2">
                        <input
                          className={input}
                          placeholder="Alasan selisih…"
                          value={notes[row.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className={ghostBtn}
                          disabled={busyId === row.id || (notes[row.id] ?? "").trim().length < 3}
                          onClick={() => void approve(row.id)}
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">{row.closingNote ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote text="Tidak ada shift kasir yang ditutup pada tanggal ini." />
      )}
    </FinanceCard>
  );
}

// ─── Monthly ────────────────────────────────────────────────────────────────

function MonthlyClosing({ overview, onChanged }: { overview: ClosingOverview; onChanged: () => void }) {
  const defaultMonth = useMemo(
    () => overview.months.find((m) => m.status !== "closed" && m.month < overview.todayKey.slice(0, 7))?.month ?? overview.months[0]?.month ?? overview.todayKey.slice(0, 7),
    [overview],
  );
  const [month, setMonth] = useState(defaultMonth);
  const [review, setReview] = useState<{ month: string; data: MonthlyClosingReview } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<MonthlyClosingReview>(`/api/finance/closing/monthly?month=${month}`)
      .then((data) => {
        if (!active) return;
        setReview({ month, data });
        setLoadError(null);
      })
      .catch((err: unknown) => active && setLoadError(err instanceof Error ? err.message : "Gagal memuat review."));
    return () => {
      active = false;
    };
  }, [month]);

  const data = review?.month === month ? review.data : null;

  async function run(action: () => Promise<MonthlyClosingReview>, success: string) {
    setBusy(true);
    try {
      const next = await action();
      setReview({ month, data: next });
      setNotes("");
      setAck(false);
      setReason("");
      toast.success(success);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal.");
    } finally {
      setBusy(false);
    }
  }

  const report = data?.report;

  return (
    <div className="space-y-5">
      <label className="flex max-w-sm items-center gap-2 text-sm text-zinc-300">
        Bulan
        <select className={input} value={month} onChange={(e) => setMonth(e.target.value)}>
          {overview.months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label} · {m.status === "closed" ? "Terkunci" : m.status === "reopened" ? "Dibuka ulang" : "Open"}
            </option>
          ))}
        </select>
      </label>

      {loadError ? <EmptyNote icon={ShieldAlert} text={loadError} /> : null}
      {!data && !loadError ? <div className="h-64 animate-pulse rounded-2xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" /> : null}

      {data && report ? (
        <>
          <StatusBanner
            closed={data.status === "closed"}
            title={data.status === "closed" ? `Month closed · ${data.label}` : `Monthly closing · ${data.label}`}
            meta={
              data.status === "closed" && data.closing
                ? `Dikunci oleh ${data.closing.closedByName ?? "-"} · ${data.closing.closedAt ? new Date(data.closing.closedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}`
                : `${data.blocking} penahan · ${data.warnings} peringatan`
            }
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <FinanceCard title="Checklist" subtitle="Daily → payroll → gudang → expense → kas → P&L" className="xl:col-span-2">
              <ul className="space-y-2">
                {data.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            </FinanceCard>
            <FinanceCard title="Profit & loss" subtitle={`${report.label} · ${report.days} hari`}>
              <Money label="Gross sales" value={report.pnl.grossSales} />
              <Money label="Net sales" value={report.pnl.netSales} strong />
              <Money label="Ongkir delivery (di luar penjualan)" value={report.pnl.deliveryFees} />
              <Money label="Biaya bahan (belanja gudang)" value={report.pnl.cogs} />
              <Money label="Gross profit" value={report.pnl.grossProfit} strong />
              <Money label="Upah & payroll" value={report.pnl.payroll} />
              <Money label="Biaya tetap & operasional" value={report.pnl.operatingExpense} />
              <Money label="Non-operasional" value={report.pnl.nonOperatingExpense} />
              {report.pnl.otherIncome ? <Money label="Pendapatan lain (sponsor event)" value={report.pnl.otherIncome} /> : null}
              <Money label="Net profit" value={report.pnl.netProfit} strong />
              <p className="mt-2 text-xs text-zinc-400">
                Net margin {percent(report.pnl.netMarginPct)} · Save Money {rupiah(report.pnl.reserveAllocation)}
              </p>
            </FinanceCard>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <FinanceCard title="BEP">
              {report.bep.target !== null ? (
                <>
                  <Money label="Target BEP bulan" value={report.bep.target} strong />
                  <p className="mt-2 text-sm text-zinc-200">
                    Achievement {percent(report.bep.achievementPct)} · {report.bep.status ? BEP_STATUS_LABEL[report.bep.status as BepStatus] : "—"}
                  </p>
                </>
              ) : (
                <EmptyNote text={"reason" in report.bep ? String(report.bep.reason) : "BEP belum bisa dihitung."} />
              )}
            </FinanceCard>
            <FinanceCard title="Capital recovery">
              <Money label="Modal" value={report.capital.initialCapital} />
              <Money label="Recovered s/d akhir bulan" value={report.capital.recovered} strong />
              <Money label="Sisa" value={report.capital.remaining} />
              <p className="mt-2 text-sm text-zinc-200">{percent(report.capital.recoveryPct)} kembali</p>
            </FinanceCard>
            <FinanceCard title="Cashflow">
              <Money label="Cash in" value={report.cashflow.cashIn} />
              <Money label="Cash out" value={report.cashflow.cashOut} />
              <Money label="Net cashflow" value={report.cashflow.net} strong />
            </FinanceCard>
          </div>

          {data.status === "closed" ? (
            <FinanceCard title="Buka ulang bulan" subtitle="Hanya Owner. Wajib alasan (audit trail).">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={input} placeholder="Alasan buka ulang (wajib)…" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy || reason.trim().length < 5}
                  onClick={() =>
                    void run(
                      () => api("/api/finance/closing/monthly/reopen", { method: "POST", body: JSON.stringify({ month, reason }) }),
                      "Bulan dibuka ulang.",
                    )
                  }
                >
                  <LockOpen className="h-4 w-4" aria-hidden /> Buka ulang
                </button>
              </div>
            </FinanceCard>
          ) : (
            <FinanceCard title="Close month" subtitle="Laporan bulan dibekukan. Daily closing bulan ini tidak bisa dibuka ulang sebelum bulan dibuka.">
              <textarea aria-label="Catatan closing bulanan" className={`${input} min-h-20 py-2`} placeholder="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              {data.warnings ? (
                <label className="mt-3 flex items-start gap-2 text-sm text-zinc-200">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--garage-red)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  Saya sudah mereview {data.warnings} peringatan pada checklist.
                </label>
              ) : null}
              <button
                type="button"
                className={`${primaryBtn} mt-4 w-full sm:w-auto`}
                disabled={busy || data.blocking > 0 || (data.warnings > 0 && !ack)}
                onClick={() =>
                  void run(
                    () =>
                      api("/api/finance/closing/monthly", {
                        method: "POST",
                        body: JSON.stringify({ month, notes: notes || undefined, acknowledgeWarnings: ack }),
                      }),
                    `${data.label} berhasil dikunci.`,
                  )
                }
              >
                <Lock className="h-4 w-4" aria-hidden /> {busy ? "Memproses…" : "Close month"}
              </button>
            </FinanceCard>
          )}
        </>
      ) : null}
    </div>
  );
}
