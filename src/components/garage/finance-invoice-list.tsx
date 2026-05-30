"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  MessageCircle,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDateFilterContext } from "@/components/garage/date-filter";

type InvoiceRow = {
  id: string;
  orderNo: string;
  invoiceNo: string;
  invoiceTrackingToken: string | null;
  invoiceWebUrl: string | null;
  whatsappInvoiceUrl: string | null;
  whatsappInvoiceStatus: string | null;
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
  payment: {
    method: string | null;
    status: string | null;
    amount: number | null;
  };
  total: number;
};

type InvoiceListResponse = {
  rows: InvoiceRow[];
  total: number;
  hasMore: boolean;
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "paid", label: "Lunas" },
  { value: "awaiting_payment", label: "Menunggu Bayar" },
  { value: "pending_cashier", label: "Menunggu Kasir" },
  { value: "accepted", label: "Diproses" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
];

export function FinanceInvoiceList() {
  const { predicate: dateFilterPredicate } = useDateFilterContext();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedRow, setSelectedRow] = useState<InvoiceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status && status !== "all") params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(`/api/finance/invoices?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        data?: InvoiceListResponse;
        error?: { message?: string };
      };
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || "Gagal memuat invoice");
      }
      setRows(data.data.rows);
      setTotal(data.data.total);
      setHasMore(data.data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat invoice");
      setRows([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [search, status, dateFrom, dateTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch list whenever filters/page change
    void load();
  }, [load]);

  function applySearch() {
    setPage(0);
    setSearch(searchInput.trim());
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Invoice
            </p>
            <h2 className="mt-1 text-xl font-black text-white">
              Daftar Invoice Customer
            </h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Semua transaksi POS &amp; QR order. Klik baris untuk detail dan kirim ulang.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] text-white"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filter row */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_160px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
            <Input
              type="search"
              placeholder="Cari No.Invoice, Customer, atau No HP..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch();
              }}
              className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            className="h-10 rounded-md border border-[#34343c] bg-white/[0.06] px-3 text-sm text-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#15151b]">
                {opt.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(0);
              }}
              className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(0);
              }}
              className="h-10 border-[#34343c] bg-white/[0.06] pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              className="garage-press h-10 px-4"
              onClick={applySearch}
            >
              Cari
            </Button>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54]"
              onClick={resetFilters}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#34343c] bg-[#111116]">
        <div className="garage-scroll overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-[#17171c]">
              <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                <th className="px-3 py-2.5 text-left font-normal">Tanggal &amp; Jam</th>
                <th className="px-3 py-2.5 text-left font-normal">No. Invoice / Order</th>
                <th className="px-3 py-2.5 text-left font-normal">Customer</th>
                <th className="px-3 py-2.5 text-right font-normal">Total</th>
                <th className="px-3 py-2.5 text-center font-normal">Status</th>
                <th className="px-3 py-2.5 text-center font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-sm text-[#8f8f99]">
                    <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-[#f5a742]" />
                    Memuat invoice…
                  </td>
                </tr>
              ) : rows.filter((row) => dateFilterPredicate(row.createdAt)).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-sm text-[#8f8f99]">
                    <Receipt className="mx-auto mb-2 size-6 text-[#4a4a54]" />
                    Tidak ada invoice ditemukan.
                  </td>
                </tr>
              ) : (
                rows.filter((row) => dateFilterPredicate(row.createdAt)).map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-[#23232a] transition-colors hover:bg-white/[0.04]"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs text-[#d6d6dc]">
                        {dateTime.format(new Date(row.createdAt))}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                        {row.channel} · {row.tableLabel}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs font-semibold text-white">
                        {row.invoiceNo}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                        {row.orderNo}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {row.customer.name}
                        </p>
                        {row.customer.isMember && (
                          <Badge className="border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd79a]">
                            {row.customer.memberLevel || "Member"}
                          </Badge>
                        )}
                      </div>
                      {row.customer.phone && (
                        <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                          {row.customer.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-mono text-sm font-bold text-[#ffd79a]">
                        {currency.format(row.total)}
                      </p>
                      {row.payment.method && (
                        <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                          {row.payment.method}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={row.status} />
                      {row.payment.status && row.payment.status !== row.status && (
                        <p className="mt-1 font-mono text-[10px] text-[#8f8f99]">
                          {row.payment.status}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(row);
                        }}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-[#34343c] px-3 py-2">
            <p className="text-xs text-[#8f8f99]">
              Menampilkan {showingFrom}–{showingTo} dari {total} invoice
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="garage-press h-8 border-[#4a4a54] px-2"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="font-mono text-xs text-[#d6d6dc]">
                Hal {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="garage-press h-8 border-[#4a4a54] px-2"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal — `key` forces re-mount per invoice → fresh state */}
      <InvoiceDetailModal
        key={selectedRow?.id ?? "none"}
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Lunas", cls: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#86efac]" },
    awaiting_payment: { label: "Tunggu Bayar", cls: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd79a]" },
    pending_cashier: { label: "Tunggu Kasir", cls: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd79a]" },
    accepted: { label: "Diproses", cls: "border-[#3b82f6]/45 bg-[#3b82f6]/14 text-[#93c5fd]" },
    rejected: { label: "Ditolak", cls: "border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffc2c8]" },
    cancelled: { label: "Batal", cls: "border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffc2c8]" },
  };
  const badge = map[status] || { label: status, cls: "border-[#34343c] bg-white/[0.04] text-[#b8b8bf]" };
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function InvoiceDetailModal({
  row,
  onClose,
}: {
  row: InvoiceRow | null;
  onClose: () => void;
}) {
  // Pass row.id via key in caller so this component re-mounts and state
  // resets when user picks a different invoice — avoids setState-in-effect.
  const [waPhone, setWaPhone] = useState(row?.customer.phone || "");
  const [waSent, setWaSent] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const fullInvoiceUrl = useMemo(() => {
    if (!row?.invoiceTrackingToken) return null;
    if (typeof window === "undefined") return row.invoiceWebUrl;
    return `${window.location.origin}${row.invoiceWebUrl}`;
  }, [row]);

  if (!row) return null;

  const buildWaUrl = (phone: string) => {
    const trimmed = phone.trim();
    const originalPhone = row.customer.phone?.trim();
    if (row.whatsappInvoiceUrl && trimmed && trimmed === originalPhone) {
      return row.whatsappInvoiceUrl;
    }
    const normalized = normalizeWaNumber(trimmed);
    const lines = [
      `Invoice GARAGE Coffee & Motor`,
      `No. Invoice: ${row.invoiceNo}`,
      `Total: ${currency.format(row.total)}`,
    ];
    if (fullInvoiceUrl) {
      lines.push(``, `Invoice & tracking:`, fullInvoiceUrl);
    }
    lines.push(``, `Terima kasih sudah mampir ke GARAGE.`);
    return `https://wa.me/${normalized}?text=${encodeURIComponent(lines.join("\n"))}`;
  };

  const handleSendWa = () => {
    const trimmed = waPhone.trim();
    if (!trimmed && !row.whatsappInvoiceUrl) return;
    const url = trimmed ? buildWaUrl(trimmed) : (row.whatsappInvoiceUrl || buildWaUrl(""));
    window.open(url, "garage-whatsapp", "noopener,noreferrer");
    setWaSent(true);
  };

  const handleCopy = async () => {
    if (!fullInvoiceUrl) return;
    try {
      await navigator.clipboard.writeText(fullInvoiceUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-[#f5a742]" />
            Detail Invoice
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {row.invoiceNo} · {row.orderNo}
          </DialogDescription>
        </DialogHeader>

        <div className="garage-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Total bill highlight */}
          <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-4">
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#ffd79a]">
              Total Tagihan
            </p>
            <p className="mt-1 garage-display text-3xl font-bold text-white">
              {currency.format(row.total)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status} />
              {row.payment.method && (
                <span className="rounded-md border border-[#34343c] px-2 py-0.5 font-mono text-[10px] text-[#d6d6dc]">
                  {row.payment.method}
                  {row.payment.status ? ` · ${row.payment.status}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              icon={Calendar}
              label="Tanggal & Jam"
              value={dateTime.format(new Date(row.createdAt))}
            />
            <DetailRow
              icon={CreditCard}
              label="Channel / Meja"
              value={`${row.channel} · ${row.tableLabel}`}
            />
            <DetailRow
              icon={User}
              label="Customer"
              value={row.customer.name}
              badge={row.customer.isMember ? (row.customer.memberLevel || "Member") : null}
            />
            <DetailRow
              icon={Phone}
              label="No. HP"
              value={row.customer.phone || "-"}
              mono
            />
          </div>

          {/* Kirim Invoice section */}
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4 text-[#25d366]" />
                <p className="garage-mono text-[11px] uppercase tracking-wide text-[#d6d6dc]">
                  Kirim Ulang Invoice
                </p>
              </div>
              {waSent && (
                <span className="garage-mono text-[10px] uppercase tracking-wide text-[#4ade80]">
                  ✓ Terbuka
                </span>
              )}
            </div>

            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
              No. WhatsApp tujuan
            </p>
            <Input
              type="tel"
              inputMode="numeric"
              value={waPhone}
              onChange={(event) =>
                setWaPhone(event.target.value.replace(/[^\d+]/g, ""))
              }
              placeholder="08xx xxxx xxxx"
              className="mt-1 h-10 border-[#34343c] bg-white/[0.06] font-mono"
            />
            <p className="mt-1 text-[10px] text-[#8f8f99]">
              Kosongkan untuk pilih kontak manual di WhatsApp.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="garage-press h-10 gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
                onClick={handleSendWa}
              >
                <MessageCircle className="size-4" />
                Kirim WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 gap-2 border-[#4a4a54]"
                onClick={() => void handleCopy()}
                disabled={!fullInvoiceUrl}
              >
                {copyState === "copied" ? (
                  <>
                    <Check className="size-4 text-[#4ade80]" />
                    Tersalin
                  </>
                ) : copyState === "error" ? (
                  <>
                    <X className="size-4 text-[#ffc2c8]" />
                    Gagal
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>

            {fullInvoiceUrl && (
              <a
                href={fullInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
              >
                <ExternalLink className="size-3.5" />
                Buka halaman invoice di tab baru
              </a>
            )}
          </div>

          {row.whatsappInvoiceStatus && row.whatsappInvoiceStatus !== "not_sent" && (
            <p className="text-xs text-[#8f8f99]">
              Riwayat WA: <span className="font-mono text-[#d6d6dc]">{row.whatsappInvoiceStatus}</span>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  badge,
  mono = false,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  badge?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-[#f5a742]" />
        <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">{label}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className={`truncate text-sm font-semibold text-white ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
        {badge && (
          <Badge className="border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd79a]">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
}

function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}
