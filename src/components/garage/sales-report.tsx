"use client";

import { Download, FileSpreadsheet, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import { downloadReportFile, fileSizeLabel, saveBlob } from "@/lib/report-download-client";
import { reportFileName } from "@/lib/report-file-name";
import { todayWibKey } from "@/lib/date-range";
import { addDaysKey, periodError } from "@/lib/report-periods";
import { useBusinessToday } from "@/lib/use-business-today";
import { buildSalesSummarySlipContent } from "@/lib/management-slips";
import { printDocument } from "@/lib/print-client";
import type { SalesReport as SalesReportData } from "@/lib/sales-report";
import { activeHours, WEEKDAY_LABELS, type WeekdayHourCell } from "@/lib/sales-insights";

type Preset = "today" | "yesterday" | "7d" | "month" | "custom";

const rupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;

/** Preset relatif terhadap `today` = tanggal operasional (cut-off, B1b). */
function rangeFor(preset: Preset, custom: { from: string; to: string }, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: addDaysKey(today, -1), to: addDaysKey(today, -1) };
  if (preset === "7d") return { from: addDaysKey(today, -6), to: today };
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return custom;
}

type ReportRow = SalesReportData["products"][number];

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(report: SalesReportData) {
  const lines: string[] = [];
  const push = (...cells: Array<string | number>) => lines.push(cells.map(csvEscape).join(","));
  push("GARAGE COFFEE");
  push("Laporan Penjualan", `${report.range.from} s/d ${report.range.to}`);
  if (report.sessionCode) push("Shift", report.sessionCode);
  push("Omzet", report.summary.gross);
  push("Transaksi", report.summary.transactions);
  push("Rata-rata per struk", report.summary.averageTicket);
  push("Item terjual", report.summary.itemsSold);
  push("Diskon", report.summary.discount);
  push("Ongkir", report.summary.deliveryFee);
  push("Void/batal", report.summary.voidCount);
  push("Refund", report.summary.refundCount);
  const section = (title: string, rows: ReportRow[], withQty: boolean) => {
    lines.push("");
    push(title, withQty ? "Qty" : "Transaksi", "Omzet");
    for (const row of rows) push(row.label, withQty ? row.qty : row.count, row.revenue);
    push(
      "TOTAL",
      rows.reduce((sum, row) => sum + (withQty ? row.qty : row.count), 0),
      rows.reduce((sum, row) => sum + row.revenue, 0),
    );
  };
  section("Produk", report.products, true);
  section("Kategori", report.categories, true);
  section("Metode bayar", report.paymentMethods, false);
  section("Per jam", report.hours, false);
  section("Kasir", report.cashiers, false);
  section("Tipe order", report.orderTypes, false);
  if (report.weekdayHours.length) {
    lines.push("");
    push("Jam sibuk (transaksi lunas)", "Hari", "Jam", "Transaksi", "Omzet");
    for (const cell of report.weekdayHours) {
      push("", WEEKDAY_LABELS[cell.weekday], `${String(cell.hour).padStart(2, "0")}.00`, cell.count, cell.revenue);
    }
  }
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  saveBlob(
    blob,
    reportFileName({
      kind: report.sessionCode ? `LAPORAN_PENJUALAN_SHIFT_${report.sessionCode}` : "LAPORAN_PENJUALAN",
      from: report.range.from,
      to: report.range.to,
      ext: "csv",
    }),
  );
}

/**
 * Pola jam sibuk (Fase 5): grid hari × jam WIB, warna amber = jumlah transaksi lunas relatif terhadap sel tersibuk.
 * Angka tertulis di sel (bukan warna saja); scroll horizontal hanya di dalam panel.
 */
function BusyHours({ cells }: { cells: WeekdayHourCell[] }) {
  const hours = activeHours(cells);
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const busiest = [...cells].sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 3);
  return (
    <section className="rounded-md border border-[#34343c] bg-white/[0.04]" data-testid="sales-busy-hours">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#34343c] px-3 py-2">
        <h3 className="text-sm font-semibold text-white">Jam sibuk (transaksi lunas per hari &amp; jam WIB)</h3>
        <p className="text-xs text-[#c4c4cc]">
          Tersibuk:{" "}
          {busiest
            .map((cell) => `${WEEKDAY_LABELS[cell.weekday]} ${String(cell.hour).padStart(2, "0")}.00 (${cell.count} trx)`)
            .join(" · ")}
        </p>
      </div>
      <div className="garage-scroll-x overflow-x-auto p-2">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#1a1a20] px-1.5 py-1 text-left font-medium text-[#c4c4cc]">Hari</th>
              {hours.map((hour) => (
                <th key={hour} className="min-w-9 px-1 py-1 text-center font-mono font-medium text-[#c4c4cc]">
                  {String(hour).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((label, weekday) => (
              <tr key={label}>
                <th scope="row" className="sticky left-0 bg-[#1a1a20] px-1.5 py-1 text-left font-semibold text-[#ececf1]">
                  {label}
                </th>
                {hours.map((hour) => {
                  const cell = byKey.get(`${weekday}:${hour}`);
                  const level = cell ? cell.count / max : 0;
                  return (
                    <td
                      key={hour}
                      className="h-8 min-w-9 rounded-sm text-center font-mono font-bold tabular-nums"
                      style={{
                        background: cell ? `rgba(245, 167, 66, ${0.14 + level * 0.66})` : "rgba(255,255,255,0.03)",
                        color: level > 0.55 ? "#1a1205" : "#ececf1",
                      }}
                      title={cell ? `${label} ${String(hour).padStart(2, "0")}.00 — ${cell.count} transaksi, ${rupiah(cell.revenue)}` : undefined}
                      aria-label={cell ? `${label} jam ${hour}: ${cell.count} transaksi` : `${label} jam ${hour}: tidak ada transaksi`}
                    >
                      {cell ? cell.count : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Table({
  title,
  rows,
  showQty,
  showAverage = false,
  emptyText = "Belum ada data.",
}: {
  title: string;
  rows: ReportRow[];
  showQty: boolean;
  /** Kolom rata-rata per transaksi (omzet ÷ trx), mis. Per kasir. */
  showAverage?: boolean;
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <section className="rounded-md border border-[#34343c] bg-white/[0.04]">
      <h3 className="border-b border-[#34343c] px-3 py-2 text-sm font-semibold text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-[#b8b8bf]">{emptyText}</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead className="sticky top-0 bg-[#1a1a20] text-xs text-[#c4c4cc]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nama</th>
                <th className="px-3 py-2 text-right font-medium">{showQty ? "Qty" : "Trx"}</th>
                {showAverage ? <th className="px-3 py-2 text-right font-medium">Rata-rata</th> : null}
                <th className="px-3 py-2 text-right font-medium">Omzet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-[#2a2a31]">
                  <td className="px-3 py-2 text-[#ececf1]">
                    <span className="block">{row.label}</span>
                    <span
                      aria-hidden="true"
                      className="mt-1 block h-1 rounded bg-[#d11a2a]/70"
                      style={{ width: `${Math.max(4, (row.revenue / max) * 100)}%` }}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-[#ececf1]">
                    {showQty ? row.qty : row.count}
                  </td>
                  {showAverage ? (
                    <td className="whitespace-nowrap px-3 py-2 text-right text-[#ececf1]">
                      {row.count ? rupiah(Math.round(row.revenue / row.count)) : "-"}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-white">
                    {rupiah(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Laporan Penjualan. Owner/Manajer: pilih rentang tanggal outlet.
 * Kasir: server otomatis membatasi ke shift miliknya.
 */
export function SalesReport({
  brand,
  printedBy,
}: {
  brand?: { brandName?: string | null; outletName?: string | null; outletCode?: string | null };
  printedBy?: string | null;
}) {
  const [preset, setPreset] = useState<Preset>("today");
  const today = useBusinessToday();
  const [custom, setCustom] = useState(() => ({ from: todayWibKey(), to: todayWibKey() }));
  const range = useMemo(() => rangeFor(preset, custom, today), [preset, custom, today]);
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((key) => key + 1), []);

  // Ambil laporan setiap rentang berubah / tombol Muat ulang. setState hanya di
  // callback (bukan sinkron di badan efek).
  const rangeError = periodError(range.from, range.to, { today: todayWibKey(), maxDays: 92 });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (rangeError) {
        setError(rangeError);
        setReport(null);
        return;
      }
      setLoading(true);
      setError(null);
      garageApi
        .get<{ report: SalesReportData | null; message?: string }>(
          `/api/reports/sales?from=${range.from}&to=${range.to}`,
          { cache: "no-store", signal: controller.signal },
        )
        .then((data) => {
          if (cancelled) return;
          setReport(data.report);
          setMessage(data.message ?? null);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Laporan gagal dimuat.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [range.from, range.to, reloadKey, rangeError]);

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "csv" | null>(null);
  async function exportServer(format: "pdf" | "xlsx" | "csv") {
    setExporting(format);
    setPrintNotice(null);
    try {
      const params = new URLSearchParams({ module: "penjualan", type: "day", format, from: range.from, to: range.to });
      const file = await downloadReportFile(`/api/reports/export?${params.toString()}`, `GARAGE_LAPORAN_PENJUALAN.${format}`);
      setPrintNotice(`${file.filename} diunduh (${fileSizeLabel(file.size)}).`);
    } catch (err) {
      setPrintNotice(err instanceof Error ? err.message : "Gagal membuat laporan.");
    } finally {
      setExporting(null);
    }
  }

  async function printSummary() {
    if (!report) return;
    setPrintNotice(null);
    const res = await printDocument((width) =>
      buildSalesSummarySlipContent(report, { width, brand, printedBy, showSignature: false }),
    );
    const data = (await res.json().catch(() => ({}))) as { printer?: string; error?: { message?: string } };
    setPrintNotice(res.ok ? `Ringkasan terkirim ke ${data.printer ?? "printer"}.` : data.error?.message ?? "Gagal mencetak.");
  }

  const shiftScope = report?.scope === "shift";
  const summary = report?.summary;
  const cards: Array<[string, string]> = summary
    ? [
        ["Omzet", rupiah(summary.gross)],
        ["Transaksi", String(summary.transactions)],
        ["Rata-rata/struk", rupiah(summary.averageTicket)],
        ["Item terjual", String(summary.itemsSold)],
        ["Diskon", rupiah(summary.discount)],
        ["Void / refund", `${summary.voidCount} / ${summary.refundCount}`],
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.045] p-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">Laporan Penjualan</h2>
          <p className="text-xs text-[#c4c4cc]">
            {shiftScope
              ? `Penjualan shift ${report?.sessionCode ?? ""} (shift Anda).`
              : `${range.from === range.to ? range.from : `${range.from} s/d ${range.to}`} · per produk, kategori, metode bayar, jam & kasir.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!shiftScope ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Rentang tanggal">
              {(
                [
                  ["today", "Hari ini"],
                  ["yesterday", "Kemarin"],
                  ["7d", "7 hari"],
                  ["month", "Bulan ini"],
                  ["custom", "Pilih"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preset === value}
                  onClick={() => setPreset(value)}
                  className={`garage-press h-9 rounded-md border px-3 text-xs font-semibold ${
                    preset === value
                      ? "border-[#e5484d] bg-[#e5484d]/20 text-white"
                      : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4ea] hover:bg-white/[0.09]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {!shiftScope && preset === "custom" ? (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                aria-label="Dari tanggal"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="h-9 w-[150px] border-[#4a4a54] bg-white/[0.06]"
              />
              <Input
                type="date"
                aria-label="Sampai tanggal"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-9 w-[150px] border-[#4a4a54] bg-white/[0.06]"
              />
            </div>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
          {shiftScope ? (
            <Button type="button" size="sm" variant="outline" disabled={!report} onClick={() => report && downloadCsv(report)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          ) : (
            (
              [
                ["pdf", "PDF", FileText],
                ["xlsx", "Excel", FileSpreadsheet],
                ["csv", "CSV", Download],
              ] as const
            ).map(([format, label, Icon]) => (
              <Button
                key={format}
                type="button"
                size="sm"
                variant="outline"
                disabled={!report || exporting !== null || Boolean(rangeError)}
                onClick={() => void exportServer(format)}
              >
                {exporting === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                {label}
              </Button>
            ))
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[#f5a742]/55 text-[#ffd08a] hover:bg-[#f5a742]/15"
            disabled={!report}
            onClick={() => void printSummary()}
          >
            <Printer className="h-4 w-4" />
            Cetak ringkasan
          </Button>
        </div>
      </div>

      {printNotice ? (
        <p role="status" className="rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-3 py-2 text-sm text-[#ffe2b0]">
          {printNotice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-[#e5484d]/50 bg-[#e5484d]/12 px-3 py-2 text-sm text-[#ffc9cb]">
          {error}
        </p>
      ) : null}
      {message && !report ? (
        <p className="rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-4 text-sm text-[#c4c4cc]">{message}</p>
      ) : null}
      {loading && !report ? (
        <p className="flex items-center gap-2 px-1 text-sm text-[#c4c4cc]">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat laporan…
        </p>
      ) : null}

      {report ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#34343c] bg-white/[0.05] p-3">
                <p className="text-xs text-[#c4c4cc]">{label}</p>
                <p className="mt-1 text-base font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Table title="Produk terlaris" rows={report.products} showQty />
            <Table title="Per kategori" rows={report.categories} showQty />
            <Table title="Per metode bayar" rows={report.paymentMethods} showQty={false} />
            <Table title="Per jam" rows={report.hours} showQty={false} />
            <Table title="Per kasir" rows={report.cashiers} showQty={false} showAverage />
            <Table title="Per tipe order" rows={report.orderTypes} showQty={false} />
          </div>
          {report.weekdayHours.length ? <BusyHours cells={report.weekdayHours} /> : null}
        </>
      ) : null}
    </div>
  );
}
