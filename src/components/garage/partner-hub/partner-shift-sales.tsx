"use client";

// Penjualan Mitra per shift (Owner 16 Nov 2026): kartu ringkas + dialog rincian per mitra & produk —
// penjualan, modal mitra (wajib bayar ke mitra), profit Garage. Data /api/finance/cash-sessions/[id]/partner-sales.
// Dipakai di POS (kartu "Penjualan shift saya", shift masih berjalan) dan detail Riwayat & Laporan Shift.
// Tidak memuat uang laci / kas seharusnya (blind count tetap utuh).

import { Handshake, ListTree, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { garageApi } from "@/lib/api-client";
import type { PartnerShiftSales } from "@/lib/partner-cashier-rules";

type PartnerShiftSalesData = PartnerShiftSales & { sessionCode: string; status: string; payoutNote: string };

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID");

function Tile({ label, value, tone, testId }: { label: string; value: string; tone?: "warn" | "good" | "bad"; testId?: string }) {
  const color = tone === "warn" ? "text-[#ffd08a]" : tone === "good" ? "text-[#86efac]" : tone === "bad" ? "text-[#ff8a94]" : "text-white";
  return (
    <div className="min-w-0 rounded-md border border-[#3a3a44] bg-white/[0.05] p-2.5" data-testid={testId}>
      <p className="truncate text-xs font-semibold text-[#d4d4d8]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-black tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function PartnerShiftSalesCard({
  sessionId,
  title = "Penjualan mitra shift ini",
  hideWhenEmpty = false,
}: {
  sessionId: string;
  title?: string;
  /** Sembunyikan kartu bila shift tidak punya produk mitra (detail shift di outlet tanpa Partner Hub). */
  hideWhenEmpty?: boolean;
}) {
  const [data, setData] = useState<PartnerShiftSalesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    garageApi
      .get<PartnerShiftSalesData>(`/api/finance/cash-sessions/${sessionId}/partner-sales`, { cache: "no-store" })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Penjualan mitra gagal dimuat."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const t = data?.totals;
  if (hideWhenEmpty && (!data || !data.partners.length)) return null;
  return (
    <section className="space-y-2 rounded-md border border-[#ff5a66]/35 bg-[#ff5a66]/[0.05] p-3" data-testid="partner-shift-sales">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-black text-white">
            <Handshake className="size-4 text-[#ff8a94]" aria-hidden /> {title}
          </p>
          <p className="text-xs text-[#d4d4d8]">Produk mitra yang sudah siap · modal mitra = wajib bayar ke mitra</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-9" disabled={loading} onClick={load} aria-label="Muat ulang penjualan mitra">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button type="button" size="sm" className="h-9" disabled={!data?.partners.length} onClick={() => setOpen(true)} data-testid="partner-shift-detail-open">
            <ListTree className="h-3.5 w-3.5" /> Rincian mitra
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[#ffb4bb]">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p className="text-sm text-[#d4d4d8]">Memuat…</p> : null}
      {data && t ? (
        data.partners.length ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Penjualan mitra" value={currency.format(t.sales)} testId="partner-shift-sales-total" />
              <Tile label="Wajib bayar ke mitra" value={currency.format(t.payable)} tone="warn" testId="partner-shift-payable" />
              <Tile label="Profit Garage" value={currency.format(t.garageProfit)} tone={t.garageProfit < 0 ? "bad" : "good"} testId="partner-shift-profit" />
              <Tile label="Item mitra siap" value={num.format(t.qty)} />
            </div>
            <ul className="grid gap-1 text-xs text-[#e4e4e8]">
              {data.partners.map((p) => (
                <li key={p.partnerId} className="flex flex-wrap justify-between gap-x-3">
                  <span className="min-w-0 break-words font-semibold">{p.partnerName}</span>
                  <span className="tabular-nums text-[#d4d4d8]">
                    {num.format(p.qty)} item · jual {currency.format(p.sales)} · bayar mitra {currency.format(p.payable)} · profit {currency.format(p.garageProfit)}
                  </span>
                </li>
              ))}
            </ul>
            {t.pendingQty || t.unpaidBillSales || t.cancelledQty ? (
              <p className="text-xs text-[#ffd08a]">
                {[
                  t.pendingQty ? `${num.format(t.pendingQty)} item belum siap dari mitra (belum dihitung)` : null,
                  t.unpaidBillSales ? `${currency.format(t.unpaidBillSales)} di bill yang belum dibayar pelanggan` : null,
                  t.cancelledQty ? `${num.format(t.cancelledQty)} item ditolak/batal (Rp0 ke mitra)` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-[#d4d4d8]">Belum ada penjualan produk mitra di shift ini.</p>
        )
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92svh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden border-[#34343c] bg-[#111114] p-0 text-[#f4f4f5] sm:max-w-3xl">
          <div className="shrink-0 border-b border-[#2a2a30] px-4 py-3 pr-12">
            <DialogTitle className="text-base font-extrabold">Rincian penjualan mitra · Shift {data?.sessionCode}</DialogTitle>
            <DialogDescription className="text-xs text-[#c4c4cc]">Per mitra dan per produk. Modal mitra dibayar lewat rekap setoran harian, bukan dari laci.</DialogDescription>
          </div>
          <div className="garage-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" data-testid="partner-shift-detail">
            {data?.partners.map((p) => (
              <section key={p.partnerId} className="space-y-2">
                <h3 className="text-sm font-black text-white">
                  {p.partnerName} <span className="font-semibold text-[#c4c4cc]">· {num.format(p.orderCount)} order</span>
                </h3>
                <div className="overflow-x-auto rounded-md border border-[#34343c]">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-white/[0.06] text-[#d4d4d8]">
                      <tr>
                        <th className="px-2 py-2 font-semibold">Produk</th>
                        <th className="px-2 py-2 text-right font-semibold">Qty</th>
                        <th className="px-2 py-2 text-right font-semibold">Harga</th>
                        <th className="px-2 py-2 text-right font-semibold">Penjualan</th>
                        <th className="px-2 py-2 text-right font-semibold">Modal mitra</th>
                        <th className="px-2 py-2 text-right font-semibold">Profit Garage</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {p.products.map((row) => (
                        <tr key={`${row.itemName}-${row.variantLabel}-${row.unitPrice}`} className="border-t border-[#2a2a30]">
                          <td className="px-2 py-1.5 text-white">
                            {row.itemName}
                            {row.variantLabel && row.variantLabel.toLowerCase() !== "regular" ? <span className="text-[#c4c4cc]"> ({row.variantLabel})</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-right">{num.format(row.qty)}</td>
                          <td className="px-2 py-1.5 text-right">{currency.format(row.unitPrice)}</td>
                          <td className="px-2 py-1.5 text-right">{currency.format(row.sales)}</td>
                          <td className="px-2 py-1.5 text-right text-[#ffd08a]">{currency.format(row.partnerCost)}</td>
                          <td className="px-2 py-1.5 text-right text-[#86efac]">{currency.format(row.garageProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-white/[0.04] font-bold tabular-nums text-white">
                      <tr className="border-t border-[#3a3a44]">
                        <td className="px-2 py-2">Total</td>
                        <td className="px-2 py-2 text-right">{num.format(p.qty)}</td>
                        <td />
                        <td className="px-2 py-2 text-right">{currency.format(p.sales)}</td>
                        <td className="px-2 py-2 text-right text-[#ffd08a]">{currency.format(p.partnerCost)}</td>
                        <td className="px-2 py-2 text-right text-[#86efac]">{currency.format(p.sales - p.partnerCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <dl className="grid gap-1 text-xs">
                  {p.refunds ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#d4d4d8]">Refund pelanggan (mengurangi profit)</dt>
                      <dd className="tabular-nums">− {currency.format(p.refunds)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 font-bold">
                    <dt>Wajib bayar ke {p.partnerName}</dt>
                    <dd className="tabular-nums text-[#ffd08a]">{currency.format(p.payable)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 font-bold">
                    <dt>Profit Garage</dt>
                    <dd className="tabular-nums text-[#86efac]">{currency.format(p.garageProfit)}</dd>
                  </div>
                  {p.unpaidBill.qty ? (
                    <p className="text-[#ffd08a]">
                      {num.format(p.unpaidBill.qty)} item ({currency.format(p.unpaidBill.sales)}) masih di bill yang belum dibayar pelanggan — tetap wajib bayar ke mitra.
                    </p>
                  ) : null}
                  {p.pending.qty ? <p className="text-[#c4c4cc]">{num.format(p.pending.qty)} item belum siap dari mitra — dihitung setelah mitra menandai Siap.</p> : null}
                  {p.cancelled.qty ? <p className="text-[#c4c4cc]">{num.format(p.cancelled.qty)} item ditolak/dibatalkan sebelum siap — Rp0 ke mitra.</p> : null}
                </dl>
              </section>
            ))}
            {data && t ? (
              <section className="space-y-1 rounded-md border border-[#3a3a44] bg-white/[0.04] p-3 text-sm">
                <p className="font-black text-white">Total semua mitra</p>
                <div className="flex justify-between gap-3">
                  <span>Penjualan mitra</span>
                  <span className="tabular-nums">{currency.format(t.sales)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Wajib bayar ke mitra</span>
                  <span className="tabular-nums font-bold text-[#ffd08a]">{currency.format(t.payable)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Profit Garage</span>
                  <span className="tabular-nums font-bold text-[#86efac]">{currency.format(t.garageProfit)}</span>
                </div>
                <p className="pt-1 text-xs text-[#c4c4cc]">{data.payoutNote}</p>
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
