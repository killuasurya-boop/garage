"use client";

import { useEffect, useId, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayWibKey } from "@/lib/date-range";
import type { EventSalesReport } from "@/lib/event-sales-report";

const money = (value: number | null) => value == null ? "Belum tersedia" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function EventSalesPanel({ eventId, canExport = false }: { eventId: string; canExport?: boolean }) {
  const formId = useId();
  const [from, setFrom] = useState(todayWibKey);
  const [to, setTo] = useState(todayWibKey);
  const [query, setQuery] = useState(() => ({ from: todayWibKey(), to: todayWibKey(), revision: 0 }));
  const [report, setReport] = useState<EventSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from: query.from, to: query.to });
        const response = await fetch(`/api/events/${eventId}/sales?${params}`, { cache: "no-store", signal: controller.signal });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.data?.report) throw new Error(json?.error?.message ?? "Laporan gagal dimuat.");
        if (!controller.signal.aborted) setReport(json.data.report);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Laporan gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [eventId, query]);

  async function downloadCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: query.from, to: query.to, format: "csv" });
      const response = await fetch(`/api/events/${eventId}/sales?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Ekspor gagal.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `GarageOS_Event_${query.from}_${query.to}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ekspor gagal.");
    } finally { setExporting(false); }
  }

  const current = report?.event.id === eventId ? report : null;
  return (
    <section className="space-y-4" aria-label="Penjualan menu event" data-testid="event-sales-panel">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setQuery({ from, to, revision: query.revision + 1 }); }}>
        <div className="min-w-0 flex-1 space-y-1 sm:flex-none">
          <label className="text-sm text-garage-dim" htmlFor={`${formId}-from`}>Dari (WIB)</label>
          <Input id={`${formId}-from`} type="date" required value={from} onChange={(event) => setFrom(event.target.value)} className="h-11" />
        </div>
        <div className="min-w-0 flex-1 space-y-1 sm:flex-none">
          <label className="text-sm text-garage-dim" htmlFor={`${formId}-to`}>Sampai (WIB)</label>
          <Input id={`${formId}-to`} type="date" required min={from} value={to} onChange={(event) => setTo(event.target.value)} className="h-11" />
        </div>
        <Button type="submit" variant="outline" className="h-11 cursor-pointer" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tampilkan
        </Button>
        {canExport && <Button type="button" variant="outline" className="h-11 cursor-pointer" disabled={loading || exporting || !current} onClick={() => void downloadCsv()}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Ekspor CSV
        </Button>}
      </form>
      {error && <p role="alert" className="rounded-lg border border-garage-red-bright/40 p-3 text-garage-red-bright">{error}</p>}
      {loading ? <div role="status" aria-label="Memuat laporan" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((key) => <div key={key} className="h-24 animate-pulse rounded-lg border border-garage-line bg-garage-bg-3 motion-reduce:animate-none" />)}
      </div> : !error && current && <>
        <p className="text-sm text-garage-dim">Outlet aktif · {current.range.from} sampai {current.range.to} (WIB). Nilai mengikuti saldo transaksi terkini.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Penjualan bersih menu", money(current.summary.netSales)],
            ["Pembayaran diterima", money(current.summary.paidRevenue)],
            ["Pembayaran pending", money(current.summary.pendingAmount)],
            ["Order / bill lunas", `${current.summary.originalOrders} order / ${current.summary.paidBills} bill`],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-garage-line bg-garage-bg-2 p-4">
            <p className="text-sm text-garage-dim">{label}</p><p className="mt-2 break-words text-lg font-semibold tabular-nums text-garage-fg">{value}</p>
          </div>)}
        </div>
        {!current.summary.bills && <p className="rounded-lg border border-garage-line p-4 text-garage-dim">Belum ada order event pada periode dan outlet ini.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["HPP snapshot", money(current.cost.total)], ["Margin kotor", money(current.cost.grossMargin)],
            ["Refund (sudah diperhitungkan)", money(current.summary.refundAmount)],
            ["Bill batal / pembayaran gagal", `${current.summary.cancelledBills} / ${money(current.summary.failedAmount)}`],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-garage-line p-3">
            <p className="text-sm text-garage-dim">{label}</p><p className="mt-1 break-words font-semibold tabular-nums text-garage-fg">{value}</p>
          </div>)}
        </div>
        {current.cost.missingComponentUnits > 0 && <p className="text-sm text-garage-amber">{current.cost.missingComponentUnits} komponen belum memiliki snapshot HPP valid. Margin belum dapat disimpulkan.</p>}
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-garage-line">
          <table className="w-full min-w-[650px] text-left text-sm">
            <caption className="px-3 py-3 text-left font-semibold text-garage-fg">Menu dan paket event</caption>
            <thead className="sticky top-0 bg-garage-bg-3 text-garage-dim"><tr>
              <th scope="col" className="p-3">Menu / paket</th><th scope="col" className="p-3">Jenis</th>
              <th scope="col" className="p-3 text-right">Unit dipesan</th><th scope="col" className="p-3 text-right">Komponen tersisa</th><th scope="col" className="p-3 text-right">Sebelum diskon</th>
            </tr></thead>
            <tbody>{current.entries.map((entry) => <tr key={entry.id} className="border-t border-garage-line">
              <td className="p-3 text-garage-fg">{entry.name}</td><td className="p-3 text-garage-dim">{entry.kind === "bundle" ? "Paket" : "Satuan"}</td>
              <td className="p-3 text-right tabular-nums">{entry.submittedUnits}</td><td className="p-3 text-right tabular-nums">{entry.remainingComponentUnits}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(entry.grossItemSales)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-lg border border-garage-line">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="px-3 py-3 text-left font-semibold text-garage-fg">Rincian komponen tersisa pada bill lunas</caption>
            <thead className="sticky top-0 bg-garage-bg-3 text-garage-dim"><tr><th scope="col" className="p-3">Produk</th><th scope="col" className="p-3">Varian</th><th scope="col" className="p-3 text-right">Qty</th><th scope="col" className="p-3 text-right">Sebelum diskon</th></tr></thead>
            <tbody>{current.components.map((row) => <tr key={`${row.name}:${row.variant}`} className="border-t border-garage-line"><td className="p-3">{row.name}</td><td className="p-3 text-garage-dim">{row.variant}</td><td className="p-3 text-right tabular-nums">{row.qty}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.grossItemSales)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="rounded-lg border border-garage-line bg-garage-bg-2 p-4 text-sm text-garage-dim">
          <p>{current.stock.message}</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">{current.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>
      </>}
    </section>
  );
}
