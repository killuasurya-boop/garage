"use client";

// Tagihan Belum Bayar (owner, Nov 2026): satu tempat untuk semua order yang belum lunas,
// dipisah jalur Cash pending vs QRIS/Transfer/E-Wallet pending. Kartu ringkas (nama · no WA ·
// meja · isi pesanan · total · umur), tap = popup detail lengkap. Pelunasan tetap lewat Final Bayar
// (server memvalidasi). Hanya tagihan pelanggan — tidak pernah kas laci (blind count).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  Copy,
  Hand,
  MessageCircle,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CashPaymentPanel, QrisPaymentPanel } from "@/components/garage/pos/pos-checkout-panels";
import { type PaymentMethod, paymentMethods } from "@/components/garage/garage-app-helpers";
import type { CustomerOrder } from "@/lib/garage-api-types";
import { currency } from "@/lib/garage-data";
import { componentLabel, groupOrderLines } from "@/lib/order-package-lines";
import { quickCashOptions } from "@/lib/pos-cash";
import { finalPayLabel } from "@/lib/pos-final-pay-label";
import { normalizePaymentReference } from "@/lib/tender-guard";
import {
  classifyPendingBill,
  formatAge,
  pendingBillsView,
  type PendingBill,
  type PendingFilter,
} from "@/lib/pos-pending-bills";

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Jam berjalan (diperbarui tiap 30 dtk) untuk umur tagihan. */
export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const AGE_LABEL = { fresh: "Baru", warn: "≥ 30 mnt", late: "≥ 60 mnt", stale: "Kemarin — cek kasir" } as const;

function sourceLabel(order: CustomerOrder) {
  if (order.offlineNo) return `Penjualan offline ${order.offlineNo}`;
  if (order.staffOrder) return "Bayar nanti (kasir/waiter)";
  if (order.orderSource === "qr_table") return "QR meja";
  if (order.orderSource === "qr_takeaway") return order.fulfillment === "delivery" ? "Delivery online" : "QR take away";
  return order.orderSource;
}

function placeLabel(order: CustomerOrder) {
  if (order.fulfillment === "delivery") return "Delivery";
  if (order.fulfillment === "takeaway") return order.queueNo ? `Take away #${order.queueNo}` : "Take away";
  return order.tableLabel;
}

/** Label pendek untuk kotak kiri kartu: "07", "TA 2", "DLV". */
function placeShort(order: CustomerOrder) {
  if (order.fulfillment === "delivery") return "DLV";
  if (order.fulfillment === "takeaway") return order.queueNo ? `TA ${order.queueNo}` : "TA";
  const number = order.tableLabel.match(/\d+/)?.[0];
  return number ? number.padStart(2, "0") : order.tableLabel.slice(0, 4);
}

function MethodChip({ bill }: { bill: PendingBill }) {
  const Icon = bill.lane === "cash" ? Banknote : bill.method === "QRIS" ? QrCode : Wallet;
  return (
    <span className="pos-v6-pend-chip" data-lane={bill.lane} data-unset={bill.method === "Belum dipilih"}>
      <Icon className="size-3.5" aria-hidden /> {bill.method}
    </span>
  );
}

function AgeChip({ bill }: { bill: PendingBill }) {
  return (
    <span className="pos-v6-pend-age" data-age={bill.age} title={AGE_LABEL[bill.age]}>
      <Clock3 className="size-3.5" aria-hidden /> {formatAge(bill.ageMinutes)}
    </span>
  );
}

export function PosV6PendingBills({
  open,
  onOpenChange,
  theme,
  orders,
  loading,
  error,
  onReload,
  onOpenDetail,
  onPrimary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme?: string;
  orders: CustomerOrder[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenDetail: (order: CustomerOrder) => void;
  onPrimary: (bill: PendingBill) => void;
}) {
  const now = useMinuteClock();
  const [filter, setFilter] = useState<PendingFilter>("all");
  const [query, setQuery] = useState("");
  const view = useMemo(() => pendingBillsView(orders, now, filter, query), [orders, now, filter, query]);
  // Partner Hub: bill yang masih memuat item ditolak mitra. Hanya peringatan — Final Bayar tidak ditahan.
  const [partnerRejected, setPartnerRejected] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pos/partner-orders", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<{ orderNo: string | null; needsRefund?: boolean }> };
        if (!cancelled) setPartnerRejected(new Set((json.data ?? []).filter((row) => row.needsRefund && row.orderNo).map((row) => row.orderNo as string)));
      } catch {
        // Tanda ini pelengkap; daftar Belum Bayar tetap dipakai walau gagal dimuat.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orders]);
  const tabs: Array<{ value: PendingFilter; label: string; icon: ReactNode; hint?: string }> = [
    { value: "all", label: "Semua", icon: null },
    { value: "cash", label: "Cash pending", icon: <Banknote className="size-4" aria-hidden />, hint: currency.format(view.totals.cash) },
    { value: "digital", label: "QRIS & Transfer", icon: <QrCode className="size-4" aria-hidden />, hint: currency.format(view.totals.digital) },
    { value: "overdue", label: "Lewat 30 mnt", icon: <AlertTriangle className="size-4" aria-hidden /> },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-cashier-theme-scope={theme} className="pos-v6-pend garage-scroll w-full overflow-y-auto p-0 sm:max-w-xl" data-testid="pos-pending-sheet">
        <SheetHeader className="pos-v6-pend-head sticky top-0 z-10 gap-2 text-left">
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Hand className="size-5" aria-hidden /> Belum Bayar
              <span className="pos-v6-pend-count">{view.counts.all}</span>
            </SheetTitle>
            <button type="button" className="pos-v6-btn-outline !min-h-10 !px-3 text-xs" onClick={onReload} disabled={loading} aria-label="Muat ulang tagihan">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Muat
            </button>
          </div>
          <SheetDescription className="text-xs">
            Tagihan pelanggan yang belum lunas, semua tanggal. Tagih → Final Bayar. Total di sini = tagihan, bukan isi laci.
          </SheetDescription>
          <div className="pos-v6-pend-tabs" role="tablist" aria-label="Jalur tagihan">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filter === tab.value}
                className="pos-v6-pend-tab"
                data-active={filter === tab.value}
                data-kind={tab.value}
                onClick={() => setFilter(tab.value)}
              >
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                  <span className="pos-v6-pend-tab-n">{view.counts[tab.value]}</span>
                </span>
                {tab.hint ? <span className="pos-v6-pend-tab-hint">{tab.hint}</span> : null}
              </button>
            ))}
          </div>
          <label className="pos-v6-pend-search">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, no WA, meja, no order, menu…"
              aria-label="Cari tagihan"
            />
          </label>
        </SheetHeader>

        <div className="space-y-2 px-3 pb-6 pt-2">
          {error ? (
            <p className="pos-v6-pend-empty" data-tone="danger" role="alert">{error}</p>
          ) : null}
          {!view.bills.length ? (
            <p className="pos-v6-pend-empty">
              <CheckCircle2 className="mx-auto mb-1 size-6" aria-hidden />
              {loading ? "Memuat tagihan…" : view.counts.all ? "Tidak ada tagihan di filter ini." : "Semua tagihan sudah lunas."}
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Daftar tagihan belum bayar">
              {view.bills.map((bill) => (
                <PendingRow key={bill.order.id} bill={bill} partnerRejected={partnerRejected.has(bill.order.orderNo)} onOpenDetail={onOpenDetail} onPrimary={onPrimary} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PendingRow({
  bill,
  onOpenDetail,
  onPrimary,
  partnerRejected = false,
}: {
  bill: PendingBill;
  onOpenDetail: (order: CustomerOrder) => void;
  onPrimary: (bill: PendingBill) => void;
  partnerRejected?: boolean;
}) {
  const { order } = bill;
  return (
    <li className="pos-v6-pend-row" data-lane={bill.lane} data-age={bill.age} data-testid="pos-pending-row">
      <button type="button" className="pos-v6-pend-main" onClick={() => onOpenDetail(order)} aria-label={`Detail tagihan ${order.orderNo} ${order.customerName ?? ""}`}>
        <span className="pos-v6-pend-place" title={placeLabel(order)}>{placeShort(order)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-extrabold">{order.customerName || "Pelanggan"}</span>
            {order.customerPhone ? <span className="pos-v6-pend-muted shrink-0 font-mono text-xs">{order.customerPhone}</span> : null}
          </span>
          <span className="pos-v6-pend-muted block truncate text-xs">
            <span className="font-mono">{order.orderNo}</span> · {bill.itemCount} item: {bill.itemsSummary}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <MethodChip bill={bill} />
            <AgeChip bill={bill} />
            {bill.cashWithWaiter ? (
              <span className="pos-v6-pend-flag">
                <Hand className="size-3.5" aria-hidden /> Uang di {order.cashHeldBy ?? "waiter"}
              </span>
            ) : null}
            {order.paymentProofUrl ? <span className="pos-v6-pend-flag">Bukti bayar masuk</span> : null}
            {partnerRejected ? (
              <span className="pos-v6-pend-flag" data-partner-rejected="true" data-testid="pos-pending-partner-rejected">
                <AlertTriangle className="size-3.5" aria-hidden /> Ada item ditolak mitra — keluarkan di Partner Hub sebelum bayar
              </span>
            ) : null}
          </span>
        </span>
        <span className="pos-v6-pend-total font-mono tabular-nums">{currency.format(order.total)}</span>
      </button>
      <button type="button" className="pos-v6-btn-primary pos-v6-pend-cta" onClick={() => onPrimary(bill)} title={bill.next.hint}>
        {bill.lane === "cash" ? <Banknote className="size-4" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
        {bill.next.label}
      </button>
    </li>
  );
}

export function PosV6PendingBillDetail({
  order,
  theme,
  onClose,
  onPrimary,
  onPrint,
  printing,
}: {
  order: CustomerOrder | null;
  theme?: string;
  onClose: () => void;
  onPrimary: (bill: PendingBill) => void;
  onPrint: (order: CustomerOrder) => void;
  printing: boolean;
}) {
  const now = useMinuteClock();
  const bill = order ? classifyPendingBill(order, now) : null;
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={Boolean(order)} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent data-cashier-theme-scope={theme} className="pos-v6-pend-detail garage-scroll max-h-[92svh] overflow-y-auto sm:max-w-lg" data-testid="pos-pending-detail">
        {order && bill ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Detail Tagihan <span className="font-mono text-sm opacity-80">{order.orderNo}</span>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5">
                <MethodChip bill={bill} />
                <AgeChip bill={bill} />
                <span className="text-xs">{bill.next.hint}</span>
              </DialogDescription>
            </DialogHeader>

            <dl className="pos-v6-pend-facts">
              <div>
                <dt><UserRound className="size-3.5" aria-hidden /> Nama</dt>
                <dd>{order.customerName || "Pelanggan"}</dd>
              </div>
              <div>
                <dt><MessageCircle className="size-3.5" aria-hidden /> No WA</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="font-mono">{order.customerPhone || "—"}</span>
                  {order.customerPhone ? (
                    <button
                      type="button"
                      className="pos-v6-pend-icon-btn"
                      aria-label="Salin nomor WA"
                      onClick={() => {
                        void navigator.clipboard?.writeText(order.customerPhone ?? "").then(() => setCopied(true));
                      }}
                    >
                      {copied ? <CheckCircle2 className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    </button>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Meja / jenis</dt>
                <dd>{placeLabel(order)}</dd>
              </div>
              <div>
                <dt>Dipesan</dt>
                <dd>{dateTimeFmt.format(new Date(order.createdAt))} · {formatAge(bill.ageMinutes)}</dd>
              </div>
              <div>
                <dt>Sumber</dt>
                <dd>{sourceLabel(order)}</dd>
              </div>
              <div>
                <dt>Status uang</dt>
                <dd>
                  {bill.cashWithWaiter
                    ? `Dipegang ${order.cashHeldBy ?? "waiter"}${order.cashReceivedAt ? ` sejak ${timeFmt.format(new Date(order.cashReceivedAt))}` : ""} — belum di kasir`
                    : order.paymentProofUrl
                      ? "Bukti dikirim pelanggan — cek notifikasi merchant"
                      : "Belum diterima"}
                </dd>
              </div>
              {order.paymentReference ? (
                <div>
                  <dt>Ref. bayar</dt>
                  <dd className="font-mono">{order.paymentReference}</dd>
                </div>
              ) : null}
            </dl>
            {order.customerNote ? <p className="pos-v6-pend-note">Catatan: {order.customerNote}</p> : null}

            <section aria-label="Isi pesanan" className="pos-v6-pend-items">
              <p className="pos-v6-pend-label">Pesanan · {bill.itemCount} item</p>
              <ul className="space-y-1.5">
                {groupOrderLines(order.items).map((group) =>
                  group.kind === "package" ? (
                    <li key={group.groupId}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words font-bold">{group.qty}× {group.name}</span>
                        <span className="shrink-0 font-mono tabular-nums">{currency.format(group.total)}</span>
                      </div>
                      <p className="pos-v6-pend-muted break-words text-xs">{group.components.map((line) => componentLabel(line, group.qty)).join(" · ")}</p>
                    </li>
                  ) : (
                    <li key={group.line.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words">
                          <b>{group.line.qty}×</b> {group.line.itemName}
                          {group.line.variantLabel && group.line.variantLabel !== "Regular" ? ` · ${group.line.variantLabel}` : ""}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">{currency.format(group.line.lineTotal)}</span>
                      </div>
                      {group.line.note ? <p className="pos-v6-pend-muted break-words text-xs">↳ {group.line.note}</p> : null}
                    </li>
                  ),
                )}
              </ul>
              <dl className="pos-v6-pend-sum">
                <div><dt>Subtotal</dt><dd>{currency.format(order.subtotal)}</dd></div>
                {order.discount ? <div><dt>Diskon</dt><dd>−{currency.format(order.discount)}</dd></div> : null}
                {order.service ? <div><dt>Layanan</dt><dd>{currency.format(order.service)}</dd></div> : null}
                {order.tax ? <div><dt>Pajak</dt><dd>{currency.format(order.tax)}</dd></div> : null}
                {order.deliveryFee ? <div><dt>Ongkir</dt><dd>{currency.format(order.deliveryFee)}</dd></div> : null}
                <div className="pos-v6-pend-grand"><dt>Total tagihan</dt><dd>{currency.format(order.total)}</dd></div>
              </dl>
            </section>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <button type="button" className="pos-v6-btn-primary justify-center" onClick={() => onPrimary(bill)} data-testid="pos-pending-detail-primary">
                {bill.lane === "cash" ? <Banknote className="size-4" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
                {bill.next.label}
              </button>
              <button type="button" className="pos-v6-btn-outline justify-center" onClick={() => onPrint(order)} disabled={printing}>
                <Printer className="size-4" aria-hidden /> {printing ? "Mencetak…" : "Cetak tagihan"}
              </button>
              {order.whatsappInvoiceUrl ? (
                <a className="pos-v6-btn-outline justify-center" href={order.whatsappInvoiceUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" aria-hidden /> WA
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Final Bayar V6: tunai WAJIB diisi (Owner, Nov 2026), digital = cek mutasi + referensi. */
export function PosV6FinalizeDialog({
  target,
  theme,
  onClose,
  method,
  setMethod,
  cash,
  setCash,
  reference,
  setReference,
  qrisImagePath,
  qrisImageReady,
  setQrisImageReady,
  referenceRequired,
  handoverNote,
  onConfirm,
  pending = false,
  error = null,
  cashAllowed = true,
}: {
  target: CustomerOrder | null;
  theme?: string;
  onClose: () => void;
  method: PaymentMethod;
  setMethod: (method: PaymentMethod) => void;
  cash: string;
  setCash: (value: string) => void;
  reference: string;
  setReference: (value: string) => void;
  qrisImagePath: string;
  qrisImageReady: boolean;
  setQrisImageReady: (ready: boolean) => void;
  referenceRequired: boolean;
  handoverNote: string | null;
  onConfirm: () => void;
  /** Request Final Bayar sedang berjalan — tombol dikunci, dialog tidak bisa ditutup. */
  pending?: boolean;
  /** Error dari server ditampilkan DI dialog ini (nominal yang diketik tetap ada). */
  error?: string | null;
  /** false = tanpa shift buka (mode Owner): Tunai tidak ditawarkan. */
  cashAllowed?: boolean;
}) {
  const total = target?.total ?? 0;
  const cashValue = Number(cash.replace(/\D/g, "")) || 0;
  const cashReady = cash !== "" && cashValue >= total;
  const referenceMissing = method === "QRIS" && referenceRequired && !normalizePaymentReference(reference);
  const label = finalPayLabel({
    method,
    cashReceived: cash,
    cashReceivedValue: cashValue,
    totalDue: total,
    qrisReferenceMissing: referenceMissing,
    tableMissing: false,
  });
  // QRIS tanpa gambar QRIS resmi terpasang tidak bisa dikonfirmasi (K11); delivery dibayar pelanggan lebih dulu.
  const qrisUnavailable = method === "QRIS" && !qrisImageReady && target?.fulfillment !== "delivery";
  const disabled = pending || qrisUnavailable || (method === "Cash" ? !cashReady || !cashAllowed : referenceMissing);
  const methods = target?.fulfillment === "delivery" ? (["QRIS"] as PaymentMethod[]) : paymentMethods;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent data-cashier-theme-scope={theme} className="pos-v6-pend-detail garage-scroll max-h-[94svh] overflow-y-auto sm:max-w-lg" data-testid="pos-finalize-dialog">
        {target ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>Final Bayar · {placeLabel(target)}</DialogTitle>
              <DialogDescription>
                <span className="font-mono">{target.orderNo}</span> · {target.customerName || "Pelanggan"} — tandai lunas hanya setelah uang/mutasi benar-benar diterima.
              </DialogDescription>
            </DialogHeader>
            {handoverNote ? (
              <p className="pos-v6-pend-flag !text-sm" data-testid="finalize-handover">Serahkan langsung: {handoverNote}</p>
            ) : null}
            <div className="pos-v6-pend-tabs" role="radiogroup" aria-label="Metode bayar">
              {methods.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={method === value}
                  className="pos-v6-pend-tab"
                  data-active={method === value}
                  disabled={
                    pending ||
                    (value === "QRIS" && !qrisImageReady && target.fulfillment !== "delivery") ||
                    (value === "Cash" && !cashAllowed)
                  }
                  title={value === "Cash" && !cashAllowed ? "Tunai butuh shift yang sedang buka" : undefined}
                  onClick={() => setMethod(value)}
                >
                  {value === "Cash" ? "Tunai" : value === "Bank Transfer" ? "Transfer" : value}
                </button>
              ))}
            </div>
            {method === "Cash" ? (
              <CashPaymentPanel
                cashReceived={cash}
                cashReceivedValue={cashValue}
                cashPaymentReady={cashReady}
                cashChange={Math.max(0, cashValue - total)}
                cashShortage={Math.max(0, total - cashValue)}
                quickCashAmounts={quickCashOptions(total)}
                totalDue={total}
                paymentPending={false}
                onCashReceivedChange={setCash}
              />
            ) : method === "QRIS" ? (
              <QrisPaymentPanel
                imagePath={qrisImagePath}
                imageReady={qrisImageReady}
                onImageReadyChange={setQrisImageReady}
                paymentReference={reference}
                onPaymentReferenceChange={setReference}
                totalDue={total}
                referenceRequired={referenceRequired}
              />
            ) : (
              <div className="space-y-2">
                <p className="pos-v6-pend-flag !text-sm">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden /> Cek mutasi {method === "E-Wallet" ? "e-wallet" : "rekening"}: nominal {currency.format(total)} sudah masuk. Screenshot pelanggan saja tidak cukup.
                </p>
                <input
                  className="pos-v6-pend-input"
                  value={reference}
                  onChange={(event) => setReference(event.target.value.slice(0, 80))}
                  placeholder="No. referensi / nama pengirim (opsional)"
                  aria-label="Referensi pembayaran"
                />
              </div>
            )}
            {!cashAllowed && target.fulfillment !== "delivery" ? (
              <p className="pos-v6-pend-flag !text-sm" data-testid="finalize-no-cash">
                Tanpa shift buka: Tunai tidak bisa dipakai (uang harus masuk laci). Pilih QRIS/Transfer atau Mulai Shift.
              </p>
            ) : null}
            {error ? (
              <p className="pos-v6-pend-flag !text-sm" role="alert" data-testid="finalize-error">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
              <button type="button" className="pos-v6-btn-outline justify-center" onClick={onClose} disabled={pending}>
                Batal
              </button>
              <button
                type="button"
                className="pos-v6-btn-primary justify-center !min-h-12 text-base"
                onClick={onConfirm}
                disabled={disabled}
                aria-busy={pending}
                data-testid="pos-finalize-confirm"
              >
                <CheckCircle2 className="size-5" aria-hidden /> {pending ? "Menyimpan pembayaran…" : label}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
