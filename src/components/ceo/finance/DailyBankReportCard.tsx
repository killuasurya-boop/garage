"use client";

// Laporan Harian Rekening Bersama (Owner 24 Nov 2026) di Closing Keuangan: pratinjau angka tanggal terpilih,
// PDF/Excel per tanggal & per periode, dan "Salin ringkasan" untuk grup keuangan.
// HPP = HPP produk × qty (bukan belanja gudang); biaya operasional = angka Finance.

import { Copy, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { categoryQtyText, dailyBankReportText, dailyBankStatusLabel, type DailyBankReport } from "@/lib/sales-hpp-summary";
import { FinanceCard } from "./FinanceCards";
import { rupiah } from "./finance-format";

const input =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--garage-input-bg)] px-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[var(--garage-focus-ring)] [color-scheme:dark]";
const linkBtn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-bold text-zinc-100 transition hover:bg-white/12 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--garage-focus-ring)]";

const url = (from: string, to: string, format: "json" | "pdf" | "xlsx") => `/api/finance/reports/daily-bank?from=${from}&to=${to}&format=${format}`;

function Row({ label, value, strong, minus, indent }: { label: string; value: number; strong?: boolean; minus?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-white/8 py-1.5 last:border-0 ${indent ? "pl-3" : ""}`}>
      <span className={`text-sm ${strong ? "font-bold text-zinc-50" : "text-zinc-300"}`}>{label}</span>
      <span className={`whitespace-nowrap font-mono text-sm tabular-nums ${strong ? "font-bold" : ""} ${value < 0 ? "text-[#ffb1b1]" : "text-zinc-100"}`}>
        {minus && value ? "- " : ""}
        {rupiah(value)}
      </span>
    </div>
  );
}

/** `refreshKey` berubah saat hari ditutup / dibuka ulang → angka & status dimuat ulang (Salin ringkasan tidak basi). */
export function DailyBankReportCard({ date, refreshKey = "" }: { date: string; refreshKey?: string }) {
  const [state, setState] = useState<{ key: string; date: string; report: DailyBankReport | null; outletName: string; error: string | null } | null>(null);
  const [from, setFrom] = useState(() => `${date.slice(0, 8)}01`);
  const [to, setTo] = useState(date);

  useEffect(() => {
    let cancelled = false;
    fetch(url(date, date, "json"), { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: { reports: DailyBankReport[]; outletName: string }; error?: { message?: string } } | null;
        if (!res.ok) throw new Error(json?.error?.message ?? "Laporan gagal dimuat.");
        if (!cancelled) setState({ key: refreshKey, date, report: json?.data?.reports[0] ?? null, outletName: json?.data?.outletName ?? "Garage Coffee", error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ key: refreshKey, date, report: null, outletName: "", error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey]);

  const fresh = state?.date === date && state.key === refreshKey;
  const r = fresh ? state.report : null;
  const loading = !fresh;
  const periodValid = from && to && from <= to;

  return (
    <FinanceCard
      title="Laporan Harian Rekening Bersama"
      subtitle="Omzet → HPP produk → laba kotor → biaya operasional → laba bersih. HPP = HPP produk × qty terjual."
    >
      {loading ? <div className="h-40 animate-pulse rounded-xl bg-[var(--garage-bg-2)] motion-reduce:animate-none" /> : null}
      {state?.error && !loading ? <p className="text-sm text-[#ffb1b1]">{state.error}</p> : null}
      {r ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <Row label={`Omzet kotor (${r.orderCount} order)`} value={r.grossSales} />
            <Row label="Diskon & refund" value={r.discount + r.refund} minus indent />
            <Row label="Omzet bersih" value={r.netSales} strong />
            <Row label="HPP produk terjual" value={r.hppProducts} minus indent />
            <Row label="Laba kotor" value={r.grossProfit} strong />
            <Row label="Upah karyawan" value={r.payroll} minus indent />
            <Row label="Biaya tetap & operasional" value={r.operatingExpense} minus indent />
            {r.nonOperatingExpense ? <Row label="Biaya non-operasional" value={r.nonOperatingExpense} minus indent /> : null}
            {r.otherIncome ? <Row label="Pendapatan lain" value={r.otherIncome} indent /> : null}
            <Row label="Laba bersih" value={r.netProfit} strong />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Terjual</p>
              <p className="mt-1 text-sm text-zinc-100">{categoryQtyText(r.sales.categories)}</p>
              {r.sales.totals.missingHppProducts ? (
                <p className="mt-1 text-xs text-[#ffd8a8]">{r.sales.totals.missingHppProducts} produk belum punya HPP (dihitung Rp0) — lengkapi di Produk.</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Uang masuk</p>
              {r.channels.length ? (
                r.channels.map((c) => <Row key={c.method} label={c.method} value={c.amount} />)
              ) : (
                <p className="mt-1 text-sm text-zinc-400">Tidak ada uang masuk tercatat.</p>
              )}
            </div>
            <p className={`text-xs font-bold ${r.hppLocked ? "text-[#86efac]" : "text-[#ffd8a8]"}`}>
              {!r.locked
                ? "Angka sementara — tutup hari (Close day) agar angka terkunci."
                : r.hppLocked
                  ? "Angka dikunci Daily Closing (HPP produk ikut dikunci)."
                  : `${dailyBankStatusLabel(r)}: hari ini dikunci sebelum HPP produk ikut dibekukan.`}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        <a className={linkBtn} href={url(date, date, "pdf")}>
          <FileText className="h-4 w-4" aria-hidden /> PDF tanggal ini
        </a>
        <a className={linkBtn} href={url(date, date, "xlsx")}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel tanggal ini
        </a>
        <button
          type="button"
          className={linkBtn}
          disabled={!r}
          onClick={() => {
            if (!r || !state) return;
            void navigator.clipboard
              .writeText(dailyBankReportText(r, state.outletName))
              .then(() => toast.success("Ringkasan disalin — tempel di grup keuangan."))
              .catch(() => toast.error("Gagal menyalin. Salin manual dari PDF."));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden /> Salin ringkasan
        </button>
      </div>

      <fieldset className="mt-4 rounded-xl border border-white/10 p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-zinc-400">Rekap periode (maks 62 hari)</legend>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-36 flex-1 gap-1 text-xs text-zinc-300">
            Dari
            <input type="date" className={input} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid min-w-36 flex-1 gap-1 text-xs text-zinc-300">
            Sampai
            <input type="date" className={input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <a className={`${linkBtn} ${periodValid ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!periodValid} href={periodValid ? url(from, to, "xlsx") : undefined}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel periode
          </a>
          <a className={`${linkBtn} ${periodValid ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!periodValid} href={periodValid ? url(from, to, "pdf") : undefined}>
            <FileText className="h-4 w-4" aria-hidden /> PDF periode
          </a>
        </div>
      </fieldset>
    </FinanceCard>
  );
}
