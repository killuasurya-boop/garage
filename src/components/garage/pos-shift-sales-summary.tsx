"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import { CHANNEL_GROUP_LABEL, CHANNEL_GROUPS } from "@/lib/payment-status";
import type { SalesReport } from "@/lib/sales-report";

// Ringkasan penjualan shift kasir (owner, Okt 2026): Cash/QRIS/Transfer +
// Dine-in kasir/Menu digital/Take away/Delivery. Data /api/reports/sales —
// untuk kasir otomatis terkunci ke shift miliknya. Hanya PENJUALAN; ekspektasi
// kas laci tetap tersembunyi (blind count) sampai tutup shift.

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function wibDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

const METHOD_TILES = [
  { key: "Tunai", label: "Cash" },
  { key: "QRIS", label: "QRIS" },
  { key: "Transfer", label: "Transfer" },
] as const;

function Tile({ label, value, count, testId }: { label: string; value: number; count?: number; testId?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#3a3a44] bg-white/[0.05] p-2.5" data-testid={testId}>
      <p className="truncate text-xs font-semibold text-[#d4d4d8]">{label}</p>
      <p className="mt-0.5 font-mono text-base font-black tabular-nums text-white">{currency.format(value)}</p>
      {count != null ? <p className="text-[11px] text-[#c4c4cc]">{count} transaksi</p> : null}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[#3a3a44] bg-white/[0.05] px-2.5 py-2" data-testid={testId}>
      <p className="truncate text-xs font-semibold text-[#d4d4d8]">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-black tabular-nums text-white">{value}</p>
    </div>
  );
}

/** `unpaidBills` = jumlah tagihan Belum Bayar outlet (dari POS); null = tidak ditampilkan. */
export function PosShiftSalesSummary({ unpaidBills = null }: { unpaidBills?: number | null } = {}) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    const today = wibDate();
    setLoading(true);
    setError(null);
    garageApi
      .get<{ report: SalesReport | null; message?: string }>(`/api/reports/sales?from=${today}&to=${today}`, {
        cache: "no-store",
      })
      .then((data) => {
        setReport(data.report);
        setMessage(data.message ?? null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ringkasan gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const methodValue = (key: string) => report?.paymentMethods.find((row) => row.key === key)?.revenue ?? 0;
  const otherMethods = (report?.paymentMethods ?? [])
    .filter((row) => !METHOD_TILES.some((tile) => tile.key === row.key))
    .reduce((sum, row) => sum + row.revenue, 0);
  const typeRow = (key: string) => report?.orderTypes.find((row) => row.key === key);

  return (
    <section className="space-y-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/[0.06] p-3" data-testid="pos-shift-sales-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-white">Penjualan shift saya</p>
          <p className="text-xs text-[#d4d4d8]">
            {report?.scope === "shift" && report.sessionCode ? `Shift ${report.sessionCode}` : "Hari ini"} · hanya transaksi lunas
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-9" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-[#ffb4bb]">{error}</p> : null}
      {!report && !error ? (
        <p className="text-sm text-[#d4d4d8]">{loading ? "Memuat…" : message ?? "Belum ada penjualan di shift ini."}</p>
      ) : null}
      {report ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Total penjualan" value={report.summary.gross} count={report.summary.transactions} testId="shift-total" />
            {METHOD_TILES.map((tile) => (
              <Tile key={tile.key} label={tile.label} value={methodValue(tile.key)} testId={`shift-method-${tile.label}`} />
            ))}
          </div>
          {/* Fase 5: angka kerja shift dari laporan yang sama — tetap tanpa saldo/expected laci (blind count). */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="shift-work-stats">
            <Stat label="Item terjual" value={String(report.summary.itemsSold)} testId="shift-items-sold" />
            <Stat label="Rata-rata per struk" value={currency.format(report.summary.averageTicket)} testId="shift-avg-ticket" />
            <Stat label="Dibatalkan" value={String(report.summary.voidCount)} testId="shift-void-count" />
            {unpaidBills != null ? <Stat label="Belum bayar (outlet)" value={`${unpaidBills} tagihan`} testId="shift-unpaid" /> : null}
          </div>
          {otherMethods > 0 ? (
            <p className="text-xs text-[#d4d4d8]">Metode lain (E-Wallet/Kartu): {currency.format(otherMethods)}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {CHANNEL_GROUPS.map((group) => {
              const row = typeRow(group);
              return (
                <Tile
                  key={group}
                  label={CHANNEL_GROUP_LABEL[group]}
                  value={row?.revenue ?? 0}
                  count={row?.count ?? 0}
                  testId={`shift-type-${group}`}
                />
              );
            })}
          </div>
          {report.products.length ? (
            <div className="rounded-md border border-[#3a3a44] bg-white/[0.04] p-2.5" data-testid="shift-top-products">
              <p className="text-xs font-semibold text-[#d4d4d8]">Paling laku shift ini</p>
              <ol className="mt-1 space-y-0.5">
                {[...report.products]
                  .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
                  .slice(0, 5)
                  .map((row, index) => (
                    <li key={row.key} className="flex items-baseline justify-between gap-2 text-sm text-white">
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-[#c4c4cc]">{index + 1}.</span> {row.label}
                      </span>
                      <span className="shrink-0 font-mono text-xs font-bold tabular-nums">{row.qty}×</span>
                    </li>
                  ))}
              </ol>
            </div>
          ) : null}
          {report.summary.voidCount > 0 ? (
            <p className="text-xs text-[#ffc2c8]">
              Dibatalkan: {report.summary.voidCount} transaksi ({currency.format(report.summary.voidValue)}) — tidak dihitung penjualan.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
