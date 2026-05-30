"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GarageApiError, garageApi } from "@/lib/api-client";
import { CashierRulesPanel } from "@/components/garage/cashier-rules-panel";

const fmtRp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const STATUS_LABELS: Record<string, string> = {
  paid: "Lunas",
  pending_cashier: "Menunggu Kasir",
  awaiting_payment: "Menunggu Bayar",
  accepted: "Diproses",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  refunded: "Direfund",
  void: "Void",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
  card: "Kartu",
  ewallet: "E-Wallet",
};

const labelForMethod = (method: string | null | undefined) =>
  !method ? "—" : PAYMENT_LABELS[method.toLowerCase()] ?? method.toUpperCase();

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status;
  if (status === "paid")
    return (
      <Badge className="border-emerald-600/40 bg-emerald-600/15 text-emerald-300">
        {label}
      </Badge>
    );
  if (status === "rejected" || status === "cancelled")
    return (
      <Badge className="border-rose-600/40 bg-rose-600/15 text-rose-300">
        {label}
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-zinc-600 text-zinc-300">
      {label}
    </Badge>
  );
}

type SalesRow = {
  id: string;
  orderNo: string;
  invoiceNo: string;
  invoiceTrackingToken: string | null;
  invoiceWebUrl: string | null;
  whatsappInvoiceUrl: string | null;
  createdAt: string;
  customer: {
    name: string;
    phone: string | null;
    isMember: boolean;
    memberLevel: string | null;
  };
  channel: string;
  tableLabel: string;
  status: string;
  payment: { method: string | null; status: string | null; amount: number | null };
  total: number;
};

type ListResponse = {
  rows: SalesRow[];
  total: number;
  hasMore: boolean;
};

type OrderReceiptData = {
  order: {
    id: string;
    orderNo: string;
    invoiceNo: string;
    invoiceTrackingToken: string | null;
    invoiceWebUrl: string | null;
    status: string;
    channel: string;
    tableLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    customerNote: string | null;
    subtotal: number;
    service: number;
    tax: number;
    discount: number;
    total: number;
    createdAt: string;
  };
  outlet: { code: string | null; name: string | null } | null;
  cashier: { id: string | null; name: string | null } | null;
  items: Array<{
    itemName: string;
    variantLabel: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    status: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
};

export function SalesHistoryView() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("limit", "100");
      const res = await garageApi.get<ListResponse>(
        `/api/orders/history?${params.toString()}`,
      );
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, [search, status, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  if (selectedId) {
    return (
      <OrderDetailView
        orderId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#d11a2a]">
            Penjualan
          </p>
          <h1 className="text-2xl font-bold text-white">History Penjualan</h1>
          <p className="text-sm text-zinc-400">
            Cari order lama, cetak struk ulang, kirim invoice ke customer.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <CashierRulesPanel />

      {/* Filter bar */}
      <Card className="border-zinc-700 bg-zinc-900/40">
        <CardContent className="grid gap-3 p-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Cari
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                className="pl-9"
                placeholder="Nomor order, nama, HP, atau meja…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="paid">Lunas</SelectItem>
                <SelectItem value="pending_cashier">Menunggu Kasir</SelectItem>
                <SelectItem value="awaiting_payment">Menunggu Bayar</SelectItem>
                <SelectItem value="accepted">Diproses</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Dari
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Sampai
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button
              className="w-full bg-[#d11a2a] hover:bg-[#b8131f]"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Cari
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-rose-600/40 bg-rose-950/20">
          <CardContent className="p-4 text-sm text-rose-200">{error}</CardContent>
        </Card>
      )}

      {/* Results */}
      <Card className="border-zinc-700 bg-zinc-900/40">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <p className="text-sm font-semibold text-white">
              {total} hasil ditemukan
            </p>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            )}
          </div>

          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              {loading ? "Memuat…" : "Tidak ada order pada filter ini."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-zinc-950/40 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Waktu</th>
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Meja</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-left">Bayar</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="text-zinc-200 hover:bg-zinc-900/60"
                    >
                      <td className="px-4 py-2 text-xs">
                        <div className="font-mono">{fmtDateTime(r.createdAt)}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs font-semibold text-white">
                          {r.invoiceNo}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {r.orderNo}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm">{r.customer.name}</div>
                        {r.customer.phone && (
                          <div className="text-[10px] text-zinc-500">
                            {r.customer.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">{r.tableLabel}</td>
                      <td className="px-4 py-2 text-zinc-400">{r.channel}</td>
                      <td className="px-4 py-2 text-xs">
                        {labelForMethod(r.payment.method)}
                      </td>
                      <td className="px-4 py-2">{statusBadge(r.status)}</td>
                      <td className="px-4 py-2 text-right font-bold">
                        {fmtRp(r.total)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(r.id)}
                        >
                          <FileText className="h-3 w-3" />
                          Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderDetailView({
  orderId,
  onBack,
}: {
  orderId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<OrderReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printResult, setPrintResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<OrderReceiptData>(
        `/api/orders/${orderId}/receipt`,
      );
      setData(res);
    } catch (err) {
      setError(
        err instanceof GarageApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Gagal memuat detail order.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch detail on mount
    void load();
  }, [load]);

  const pdfUrl = useMemo(
    () => `/api/orders/${orderId}/invoice`,
    [orderId],
  );

  async function reprintThermal() {
    if (!data) return;
    setPrinting(true);
    setPrintResult(null);
    try {
      const payment = data.payments[0];
      const cashReceivedMeta =
        (payment?.metadata as { cashReceived?: number })?.cashReceived ?? null;
      const changeMeta =
        (payment?.metadata as { change?: number })?.change ?? null;

      const receipt = {
        invoiceNo: data.order.invoiceNo,
        orderNo: data.order.orderNo,
        createdAt: data.order.createdAt,
        outlet: data.outlet
          ? { name: data.outlet.name, code: data.outlet.code }
          : null,
        cashier: data.cashier ? { name: data.cashier.name } : null,
        payment: payment
          ? {
              method: payment.method,
              provider:
                (payment.metadata as { provider?: string })?.provider ?? null,
              reference:
                (payment.metadata as { reference?: string })?.reference ?? null,
              cashReceived: cashReceivedMeta,
              change: changeMeta,
            }
          : null,
        items: data.items.map((it) => ({
          itemName: it.itemName,
          variantLabel: it.variantLabel,
          qty: it.qty,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        subtotal: data.order.subtotal,
        service: data.order.service,
        tax: data.order.tax,
        discount: data.order.discount,
        total: data.order.total,
        invoiceWebUrl: data.order.invoiceWebUrl,
      };

      const res = await garageApi.post<{ success: boolean; printer?: string }>(
        "/api/print/thermal",
        { receipt },
      );
      setPrintResult(
        res.success
          ? `Tercetak${res.printer ? ` ke ${res.printer}` : ""}.`
          : "Print gagal — cek thermal printer.",
      );
    } catch (err) {
      setPrintResult(
        err instanceof Error ? `Gagal: ${err.message}` : "Print gagal.",
      );
    } finally {
      setPrinting(false);
    }
  }

  async function copyInvoiceLink() {
    if (!data?.order.invoiceWebUrl) return;
    try {
      const url = new URL(data.order.invoiceWebUrl, window.location.origin)
        .toString();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !data}
            onClick={() => void reprintThermal()}
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Cetak Struk Ulang
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || !data?.order.invoiceWebUrl}
            onClick={() => void copyInvoiceLink()}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Tersalin" : "Salin Link Invoice"}
          </Button>
          <Button
            size="sm"
            className="bg-[#d11a2a] hover:bg-[#b8131f]"
            disabled={loading || !data}
            onClick={() => window.open(pdfUrl, "_blank")}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </header>

      {printResult && (
        <Card
          className={`${
            printResult.startsWith("Gagal")
              ? "border-rose-600/40 bg-rose-950/20 text-rose-200"
              : "border-emerald-600/40 bg-emerald-950/20 text-emerald-200"
          }`}
        >
          <CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
            <span>{printResult}</span>
            <button
              type="button"
              onClick={() => setPrintResult(null)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-rose-600/40 bg-rose-950/20">
          <CardContent className="p-4 text-sm text-rose-200">{error}</CardContent>
        </Card>
      )}

      {loading || !data ? (
        <Card className="border-zinc-700 bg-zinc-900/40">
          <CardContent className="flex items-center gap-2 p-6 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat detail order…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-zinc-700 bg-zinc-900/40">
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-zinc-500">Invoice</p>
                <p className="font-mono text-lg font-bold text-white">
                  {data.order.invoiceNo}
                </p>
                <p className="text-xs text-zinc-500">{data.order.orderNo}</p>
              </div>
              <div className="md:text-right">
                <p className="text-xs uppercase text-zinc-500">Total</p>
                <p className="text-xl font-bold text-[#d11a2a]">
                  {fmtRp(data.order.total)}
                </p>
                <div className="mt-1 inline-block">
                  {statusBadge(data.order.status)}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-zinc-500">Customer</p>
                <p className="text-white">
                  {data.order.customerName ?? "Guest"}
                </p>
                {data.order.customerPhone && (
                  <p className="text-xs text-zinc-400">
                    {data.order.customerPhone}
                  </p>
                )}
              </div>
              <div className="md:text-right">
                <p className="text-xs uppercase text-zinc-500">Kasir</p>
                <p className="text-white">{data.cashier?.name ?? "—"}</p>
                <p className="text-xs text-zinc-400">
                  <Calendar className="mr-1 inline h-3 w-3" />
                  {fmtDateTime(data.order.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-zinc-500">Meja</p>
                <p className="text-white">{data.order.tableLabel}</p>
                <p className="text-xs text-zinc-400">{data.order.channel}</p>
              </div>
              {data.outlet && (
                <div className="md:text-right">
                  <p className="text-xs uppercase text-zinc-500">Outlet</p>
                  <p className="text-white">{data.outlet.name}</p>
                  <p className="text-xs text-zinc-400">{data.outlet.code}</p>
                </div>
              )}

              {data.order.customerNote && (
                <div className="md:col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
                  Catatan: {data.order.customerNote}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-700 bg-zinc-900/40">
            <CardContent className="p-0">
              <div className="border-b border-zinc-800 px-4 py-2 text-sm font-semibold">
                Rincian Pesanan ({data.items.length} item)
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Harga</th>
                    <th className="px-4 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {data.items.map((it, i) => (
                    <tr key={i} className="text-zinc-200">
                      <td className="px-4 py-2">
                        {it.itemName}
                        {it.variantLabel &&
                          it.variantLabel.toLowerCase() !== "regular" && (
                            <span className="text-zinc-500">
                              {" — "}
                              {it.variantLabel}
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-2 text-right">{it.qty}</td>
                      <td className="px-4 py-2 text-right">
                        {fmtRp(it.unitPrice)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {fmtRp(it.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-zinc-800 text-sm">
                  <tr>
                    <td className="px-4 py-1 text-right text-zinc-400" colSpan={3}>
                      Subtotal
                    </td>
                    <td className="px-4 py-1 text-right">
                      {fmtRp(data.order.subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-1 text-right text-zinc-400" colSpan={3}>
                      Service
                    </td>
                    <td className="px-4 py-1 text-right">
                      {fmtRp(data.order.service)}
                    </td>
                  </tr>
                  {data.order.tax > 0 && (
                    <tr>
                      <td
                        className="px-4 py-1 text-right text-zinc-400"
                        colSpan={3}
                      >
                        Pajak
                      </td>
                      <td className="px-4 py-1 text-right">
                        {fmtRp(data.order.tax)}
                      </td>
                    </tr>
                  )}
                  {data.order.discount > 0 && (
                    <tr>
                      <td
                        className="px-4 py-1 text-right text-zinc-400"
                        colSpan={3}
                      >
                        Diskon / Promo
                      </td>
                      <td className="px-4 py-1 text-right">
                        - {fmtRp(data.order.discount)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      className="px-4 py-2 text-right text-base font-bold"
                      colSpan={3}
                    >
                      TOTAL
                    </td>
                    <td className="px-4 py-2 text-right text-base font-bold text-[#d11a2a]">
                      {fmtRp(data.order.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {data.payments.length > 0 && (
            <Card className="border-zinc-700 bg-zinc-900/40">
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-semibold">Pembayaran</p>
                <div className="space-y-1 text-sm">
                  {data.payments.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-b border-zinc-800/60 pb-1 last:border-0"
                    >
                      <div>
                        <span className="text-white">
                          {labelForMethod(p.method)}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">
                          {fmtDateTime(p.createdAt)} · {p.status}
                        </span>
                      </div>
                      <span className="font-semibold">{fmtRp(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
