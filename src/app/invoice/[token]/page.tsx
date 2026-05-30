import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Bike,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  QrCode,
  ReceiptText,
  Smartphone,
  Star,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { getInvoiceLiveStatus, getPublicInvoiceTracking } from "@/lib/garage-service";
import { InvoiceLiveTracker } from "./invoice-live-tracker";
import { InvoicePrintButton } from "./invoice-print-button";
import { InvoiceQrCode } from "./invoice-qr";

export const metadata: Metadata = {
  title: "Invoice Tracking - GARAGE Coffee & Motor",
  description: "Tracking invoice customer GARAGE Coffee & Motor.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function orderStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_cashier: { label: "Menunggu Kasir", cls: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
    awaiting_payment: { label: "Menunggu Bayar", cls: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
    accepted: { label: "Diproses", cls: "bg-blue-500/15 border-blue-500/40 text-blue-300" },
    paid: { label: "Lunas", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    rejected: { label: "Ditolak", cls: "bg-red-500/15 border-red-500/40 text-red-300" },
    cancelled: { label: "Dibatalkan", cls: "bg-red-500/15 border-red-500/40 text-red-300" },
  };
  const badge = map[status];
  if (!badge) return <span className="rounded-md border border-[#34343c] px-2 py-1 font-mono text-[10px] text-[#b8b8bf]">{status}</span>;
  return <span className={`rounded-md border px-2 py-1 font-mono text-[10px] ${badge.cls}`}>{badge.label}</span>;
}

function kitchenStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting_cashier: { label: "Menunggu Validasi", cls: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
    queue: { label: "Masuk Antrian", cls: "bg-blue-500/15 border-blue-500/40 text-blue-300" },
    cooking: { label: "Sedang Dibuat", cls: "bg-orange-500/15 border-orange-500/40 text-orange-300" },
    ready: { label: "Siap Diambil", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    delivered: { label: "Sudah Diterima", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    completed: { label: "Selesai", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    rejected: { label: "Ditolak", cls: "bg-red-500/15 border-red-500/40 text-red-300" },
  };
  const badge = map[status];
  if (!badge) return <span className="rounded-md border border-[#34343c] px-2 py-1 font-mono text-[10px] text-[#b8b8bf]">{status}</span>;
  return <span className={`rounded-md border px-2 py-1 font-mono text-[10px] ${badge.cls}`}>{badge.label}</span>;
}

function paymentStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Belum Bayar", cls: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
    paid: { label: "Lunas", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    issued: { label: "Terbit", cls: "bg-green-500/15 border-green-500/40 text-green-300" },
    failed: { label: "Gagal", cls: "bg-red-500/15 border-red-500/40 text-red-300" },
    cancelled: { label: "Batal", cls: "bg-red-500/15 border-red-500/40 text-red-300" },
  };
  const badge = map[status.toLowerCase()];
  if (!badge) return <span className="rounded-md border border-[#34343c] px-2 py-1 font-mono text-[10px] text-[#b8b8bf]">{status}</span>;
  return <span className={`rounded-md border px-2 py-1 font-mono text-[10px] ${badge.cls}`}>{badge.label}</span>;
}

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

const trackingSteps: Array<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "received",
    label: "Order Masuk",
    description: "Pesanan berhasil terkirim.",
    icon: ReceiptText,
  },
  {
    id: "cashier",
    label: "Diproses Kasir",
    description: "Kasir sedang cek order dan pembayaran.",
    icon: Clock,
  },
  {
    id: "kitchen",
    label: "Masuk Dapur",
    description: "Order sudah masuk antrian kitchen/bar.",
    icon: Utensils,
  },
  {
    id: "cooking",
    label: "Dimasak",
    description: "Pesanan sedang dibuat.",
    icon: ChefHat,
  },
  {
    id: "ready",
    label: "Siap Diantar",
    description: "Pesanan sudah siap.",
    icon: PackageCheck,
  },
  {
    id: "delivered",
    label: "Diantar / Selesai",
    description: "Pesanan sudah diterima customer.",
    icon: CheckCircle2,
  },
];

function trackingStepIndex(input: { orderStatus: string; kitchenStatus: string }) {
  if (input.orderStatus === "rejected" || input.kitchenStatus === "rejected") return -1;
  if (input.kitchenStatus === "delivered" || input.kitchenStatus === "completed") return 5;
  if (input.kitchenStatus === "ready") return 4;
  if (input.kitchenStatus === "cooking") return 3;
  if (input.kitchenStatus === "queue") return 2;
  if (input.orderStatus === "accepted" || input.orderStatus === "paid") return 2;
  return 1;
}

// Step timestamps are derived from order timing; if audit trail available use it
const STEP_LABELS: Record<string, string> = {
  received: "Order dibuat",
  cashier: "Dicek kasir",
  kitchen: "Masuk dapur",
  cooking: "Mulai dibuat",
  ready: "Selesai dibuat",
  delivered: "Diserahkan",
};

export default async function InvoiceTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invoice, liveStatus] = await Promise.all([
    getPublicInvoiceTracking(token),
    getInvoiceLiveStatus(token),
  ]);
  if (!invoice) {
    notFound();
  }

  const activeTrackingStep = trackingStepIndex({
    orderStatus: invoice.orderStatus,
    kitchenStatus: invoice.kitchenStatus,
  });

  const orderTime = dateTime(invoice.createdAt);

  return (
    <main className="invoice-web-print min-h-screen bg-[#08080a] text-[#f4f4f5]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .print-only { display: none; }

            @media print {
              /* === PAGE SETUP === */
              @page { size: A4; margin: 8mm 10mm; }
              html, body { background: #ffffff !important; }
              body * { visibility: hidden !important; }
              .invoice-web-print, .invoice-web-print * { visibility: visible !important; }
              .invoice-web-print {
                background: #ffffff !important;
                color: #111827 !important;
                inset: 0 auto auto 0;
                position: absolute;
                width: 100%;
                font-size: 9pt !important;
                line-height: 1.35 !important;
              }

              /* === HIDE INTERACTIVE / WEB-ONLY === */
              .invoice-web-print a,
              .invoice-web-print button,
              .no-print,
              .invoice-status-cards,
              .invoice-timeline,
              .invoice-info-order {
                display: none !important;
              }

              /* === RESET DARK THEME → LIGHT === */
              .invoice-web-print section,
              .invoice-web-print div,
              .invoice-web-print aside {
                box-shadow: none !important;
                background: transparent !important;
                border-color: #d1d5db !important;
                color: #111827 !important;
              }
              .invoice-web-print p,
              .invoice-web-print span,
              .invoice-web-print h1,
              .invoice-web-print h2,
              .invoice-web-print th,
              .invoice-web-print td { color: #111827 !important; }
              .invoice-web-print .text-\\[\\#b8b8bf\\],
              .invoice-web-print .text-\\[\\#8f8f99\\],
              .invoice-web-print .text-\\[\\#d6d6dc\\] { color: #6b7280 !important; }
              .invoice-web-print .text-\\[\\#ffd79a\\],
              .invoice-web-print .text-\\[\\#f5a742\\],
              .invoice-web-print .text-\\[\\#ffe7b8\\] { color: #b45309 !important; }

              /* === PRINT-ONLY ELEMENTS === */
              .print-only { display: block !important; }
              .invoice-web-print .print-logo { display: block !important; }

              /* === HEADER (compact, 2-col) === */
              .invoice-header-print {
                border-bottom: 2px solid #f5a742 !important;
                padding: 0 0 6px 0 !important;
                margin: 0 0 8px 0 !important;
              }

              /* === MAIN HEADER section: tighten === */
              .invoice-web-print > section:first-of-type {
                border: none !important;
                padding: 0 !important;
              }
              .invoice-web-print > section:first-of-type > div {
                max-width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
              }

              /* Brand + total bill row: keep compact */
              .invoice-web-print h1 {
                font-size: 14pt !important;
                margin: 4px 0 0 0 !important;
              }
              .invoice-web-print .invoice-total-bill {
                padding: 6px 10px !important;
                background: #fff7ed !important;
                border: 1px solid #fbbf24 !important;
              }
              .invoice-web-print .invoice-total-bill p:nth-child(2) {
                font-size: 16pt !important;
                color: #b45309 !important;
              }

              /* === BODY: items + sidebar → stacked compact === */
              .invoice-web-print > section:nth-of-type(2) {
                display: block !important;
                padding: 0 !important;
                margin: 0 !important;
                gap: 0 !important;
              }
              .invoice-web-print > section:nth-of-type(2) > div,
              .invoice-web-print > section:nth-of-type(2) > aside {
                display: block !important;
                width: 100% !important;
              }

              /* === ITEMS table compact === */
              .invoice-items-scroll { overflow: visible !important; }
              .invoice-items-table { min-width: 0 !important; width: 100% !important; }
              .invoice-items-table thead tr {
                color: #6b7280 !important;
                border-color: #9ca3af !important;
                border-bottom-width: 1px !important;
              }
              .invoice-items-table tbody tr { border-color: #e5e7eb !important; }
              .invoice-items-table th,
              .invoice-items-table td {
                padding: 4px 6px !important;
                font-size: 8.5pt !important;
                color: #111827 !important;
              }
              .invoice-item-row { border-color: #e5e7eb !important; }

              /* === PRINT-ONLY META STRIP (date + customer + status) === */
              .invoice-print-meta-strip {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 8px !important;
                margin: 0 0 8px 0 !important;
                padding: 6px 8px !important;
                border: 1px solid #d1d5db !important;
                border-radius: 4px !important;
                background: #f9fafb !important;
                font-size: 8.5pt !important;
              }
              .invoice-print-meta-strip .label {
                font-size: 7pt !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
                color: #6b7280 !important;
                margin: 0 0 1px 0 !important;
              }
              .invoice-print-meta-strip .value {
                font-weight: 600 !important;
                color: #111827 !important;
              }

              /* === SECTION HEADINGS compact === */
              .invoice-web-print section > div > p:first-child,
              .invoice-web-print section > div > div > p:first-child {
                font-size: 7.5pt !important;
              }

              /* === TOTAL + QR side-by-side === */
              .invoice-print-summary-grid {
                display: grid !important;
                grid-template-columns: 1fr 110px !important;
                gap: 12px !important;
                margin: 8px 0 0 0 !important;
                padding: 8px 0 0 0 !important;
                border-top: 1px solid #d1d5db !important;
              }
              .invoice-total-row { border-top: 1px solid #9ca3af !important; }
              .invoice-web-print .invoice-grand-total-value {
                font-size: 13pt !important;
                color: #b45309 !important;
              }

              /* === QR for print: smaller, no card === */
              .invoice-qr-print canvas,
              .invoice-qr-print svg,
              .invoice-qr-print img {
                width: 90px !important;
                height: 90px !important;
              }

              /* === CUSTOMER inline === */
              .invoice-customer-card {
                padding: 4px 0 !important;
                border: none !important;
                background: transparent !important;
              }
              .invoice-customer-card h2 {
                font-size: 9.5pt !important;
                margin: 2px 0 !important;
              }

              /* === Hide section card chrome on print === */
              .invoice-web-print section[class*="rounded"],
              .invoice-web-print div[class*="rounded-md"] {
                border-radius: 0 !important;
              }

              /* === FOOTER compact === */
              .invoice-web-print footer {
                border-top: 1px solid #d1d5db !important;
                padding: 6px 0 0 0 !important;
                margin: 8px 0 0 0 !important;
              }
            }
          `,
        }}
      />

      {/* ─── PRINT HEADER (logo) ─── */}
      <div className="print-only print-logo mb-3 text-center" style={{ display: "none" }}>
        <Image
          src="/garage-brand/logo-website.png"
          alt="GARAGE Coffee & Motor"
          width={240}
          height={80}
          className="mx-auto h-12 object-contain"
        />
      </div>

      {/* ─── MAIN HEADER ─── */}
      <section className="border-b border-[#34343c] bg-[#111116]">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Outlet identity row */}
          <div className="mb-5 flex items-start justify-between gap-4 print-only invoice-header-print" style={{ display: "none" }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#f5a742]">
                GARAGE Coffee &amp; Motor
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Outlet: {invoice.tableLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold text-gray-800">MASTER INVOICE</p>
              <p className="mt-0.5 font-mono text-xs text-gray-600">{invoice.invoiceNo}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Left: Brand + invoice meta */}
            <div>
              {/* Desktop logo */}
              <div className="hidden sm:block">
                <Image
                  src="/garage-brand/logo-website.png"
                  alt="GARAGE Coffee & Motor"
                  width={240}
                  height={80}
                  className="h-10 w-auto object-contain"
                />
              </div>
              {/* Mobile logo */}
              <div className="sm:hidden">
                <Image
                  src="/garage-brand/logo-icon.png"
                  alt="GARAGE"
                  width={80}
                  height={80}
                  className="h-10 w-auto object-contain"
                />
              </div>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-[#f5a742]">
                GARAGE Coffee &amp; Motor
              </p>

              {/* Outlet info */}
              <div className="mt-3 flex flex-col gap-1">
                {invoice.tableLabel && (
                  <div className="flex items-center gap-2 text-xs text-[#b8b8bf]">
                    <MapPin className="size-3 shrink-0 text-[#f5a742]" />
                    <span>{invoice.tableLabel}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[#b8b8bf]">
                  <Phone className="size-3 shrink-0 text-[#f5a742]" />
                  <span>0812-xxxx-xxxx</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#b8b8bf]">
                  <Smartphone className="size-3 shrink-0 text-[#f5a742]" />
                  <span>www.garage.id</span>
                </div>
              </div>

              {/* Invoice meta */}
              <div className="mt-4">
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Master Invoice
                </h1>
                <p className="mt-1 font-mono text-xs text-[#b8b8bf]">
                  {invoice.invoiceNo} &nbsp;/&nbsp; {invoice.orderNo}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#b8b8bf]">
                  {orderTime}
                </p>
              </div>
            </div>

            {/* Right: Total bill */}
            <div className="invoice-total-bill rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-4 py-3 text-left sm:text-right">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ffd79a]">
                Total Tagihan
              </p>
              <p className="mt-1 text-2xl font-black text-white">{rupiah.format(invoice.total)}</p>
              <div className="mt-2 flex items-center gap-2 sm:justify-end">
                {orderStatusBadge(invoice.orderStatus)}
                {paymentStatusBadge(invoice.payment.status ?? invoice.invoiceStatus)}
              </div>
              {invoice.channel && (
                <div className="mt-1 flex items-center gap-1 sm:justify-end">
                  {invoice.channel === "Grab" && <Bike className="size-3 text-green-400" />}
                  <span className="rounded-md border border-[#34343c] px-2 py-0.5 font-mono text-[10px] text-[#8f8f99]">
                    {invoice.channel}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Status summary cards (web only — print hides ini, ada di meta strip) */}
          <div className="invoice-status-cards mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-[#f5a742]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">Status Order</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {orderStatusBadge(invoice.orderStatus)}
              </div>
            </div>
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-4 text-[#f5a742]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">Status Kitchen</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {kitchenStatusBadge(invoice.kitchenStatus)}
              </div>
            </div>
            <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-[#22c55e]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">Pembayaran</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">{invoice.payment.method ?? "-"}</span>
                {paymentStatusBadge(invoice.payment.status ?? invoice.invoiceStatus)}
              </div>
            </div>
          </div>

          {/* Live Tracking (web only — print hides) */}
          <div className="invoice-timeline mt-4">
            {liveStatus ? (
              <InvoiceLiveTracker token={token} initialStatus={liveStatus} />
            ) : (
              <InvoiceTrackingTimeline
                activeStep={activeTrackingStep}
                orderCreatedAt={invoice.createdAt}
                orderUpdatedAt={invoice.updatedAt}
              />
            )}
          </div>

          {/* === PRINT-ONLY: META STRIP ringkas (info kunci) === */}
          <div className="print-only invoice-print-meta-strip" style={{ display: "none" }}>
            <div>
              <p className="label">Tanggal Order</p>
              <p className="value">{orderTime}</p>
            </div>
            <div>
              <p className="label">Lokasi / Meja</p>
              <p className="value">{invoice.tableLabel || "-"}</p>
            </div>
            <div>
              <p className="label">Pembayaran</p>
              <p className="value">
                {invoice.payment.method ?? "-"}
                {invoice.payment.provider ? ` · ${invoice.payment.provider}` : ""}
              </p>
            </div>
            <div>
              <p className="label">Status Order</p>
              <p className="value">{invoice.orderStatus.replace(/_/g, " ").toUpperCase()}</p>
            </div>
            <div>
              <p className="label">Status Kitchen</p>
              <p className="value">{invoice.kitchenStatus.replace(/_/g, " ").toUpperCase()}</p>
            </div>
            <div>
              <p className="label">Reference</p>
              <p className="value">{valueOrDash(invoice.payment.reference)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BODY: Items + Sidebar ─── */}
      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">

        {/* Left column */}
        <div className="space-y-4">

          {/* ── Items ── */}
          <div className="rounded-md border border-[#34343c] bg-[#111116] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                  Detail Item
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">{invoice.items.length} item</h2>
              </div>
              {invoice.channel ? (
                <span className="rounded-md border border-[#34343c] px-2 py-1 font-mono text-[10px] text-[#b8b8bf]">
                  {invoice.channel}
                </span>
              ) : null}
            </div>

            <div className="invoice-items-scroll mt-3 -mx-1 overflow-x-auto px-1">
              <table className="invoice-items-table w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#34343c] font-mono text-[10px] uppercase tracking-wider text-[#8f8f99]">
                    <th className="w-8 py-2 pr-2 text-left font-normal">#</th>
                    <th className="py-2 pr-2 text-left font-normal">Item</th>
                    <th className="w-24 py-2 pr-2 text-right font-normal">Harga</th>
                    <th className="w-14 py-2 pr-2 text-center font-normal">Qty</th>
                    <th className="w-28 py-2 text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="invoice-item-row border-b border-[#23232a] last:border-b-0 align-top"
                    >
                      <td className="py-2.5 pr-2 font-mono text-xs text-[#8f8f99]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="font-semibold text-white">
                          {item.itemName}
                        </span>
                        {item.variantLabel ? (
                          <span className="text-[#b8b8bf]">
                            {" "}
                            &middot; {item.variantLabel}
                          </span>
                        ) : null}
                        {item.note ? (
                          <p className="mt-0.5 text-[11px] italic text-[#f5a742]/85">
                            {item.note}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono text-xs text-[#d6d6dc]">
                        {rupiah.format(item.unitPrice)}
                      </td>
                      <td className="py-2.5 pr-2 text-center font-mono text-xs font-semibold text-white">
                        {item.qty}x
                      </td>
                      <td className="py-2.5 text-right font-mono text-sm font-semibold text-[#ffd79a]">
                        {rupiah.format(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Tracking info (web only — print hides, info di meta strip) ── */}
          <div className="invoice-info-order rounded-md border border-[#34343c] bg-[#111116] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Informasi Order
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoRow label="Tanggal & Waktu Order" value={dateTime(invoice.createdAt)} />
              <InfoRow label="Update Terakhir" value={dateTime(invoice.updatedAt)} />
              <InfoRow label="Lokasi / Meja" value={invoice.tableLabel} />
              <InfoRow label="Status Invoice" value={invoice.invoiceStatus} />
              <InfoRow label="Provider Pembayaran" value={valueOrDash(invoice.payment.provider)} />
              <InfoRow label="Reference ID" value={valueOrDash(invoice.payment.reference)} />
            </div>
          </div>

        </div>

        {/* Right column: Customer + Summary */}
        <aside className="space-y-4">

          {/* ── Customer ── */}
          <div className="invoice-customer-card rounded-md border border-[#34343c] bg-[#111116] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Customer
            </p>
            <h2 className="mt-2 text-lg font-bold text-white">
              {invoice.customer.name ?? "Customer"}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#b8b8bf]">
              <Phone className="size-3 shrink-0" />
              {invoice.customer.phone}
            </p>
            {invoice.customer.note ? (
              <div className="mt-3 rounded-md border border-[#f5a742]/20 bg-[#f5a742]/06 p-3">
                <p className="text-xs font-medium text-[#f5a742]/90">
                  Catatan:
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#d6d6dc]">
                  {invoice.customer.note}
                </p>
              </div>
            ) : null}
          </div>

          {/* ── Ringkasan ── */}
          <div className="rounded-md border border-[#34343c] bg-[#111116] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
              Ringkasan
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <TotalRow
                label="Subtotal"
                value={`${rupiah.format(invoice.subtotal)}`}
              />
              <TotalRow
                label="Service (5%)"
                value={`${rupiah.format(invoice.service)}`}
              />
              <TotalRow
                label="Ppn (11%)"
                value={`${rupiah.format(invoice.tax)}`}
              />
              {invoice.discount > 0 && (
                <TotalRow
                  label="Diskon"
                  value={`-${rupiah.format(invoice.discount)}`}
                  discount
                />
              )}
              <div className="mt-3 border-t border-[#34343c] pt-3 invoice-total-row">
                <TotalRow
                  label="Total"
                  value={rupiah.format(invoice.total)}
                  strong
                />
              </div>
              {(() => {
                const paymentAny = invoice.payment as { cashReceived?: number; change?: number } | null;
                if (invoice.payment.method === "Cash" && paymentAny?.cashReceived) {
                  return (
                    <>
                      <TotalRow
                        label="Tunai"
                        value={rupiah.format(paymentAny.cashReceived)}
                      />
                      <TotalRow
                        label="Kembalian"
                        value={rupiah.format(Math.max(0, paymentAny.cashReceived - invoice.total))}
                      />
                    </>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* QR Code Tracking */}
          <div className="invoice-qr-print rounded-md border border-[#34343c] bg-[#111116] p-4">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-[#f5a742]" />
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#b8b8bf]">
                Scan Tracking
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#8f8f99]">
              Scan QR ini untuk track pesanan dan kirim ulang link invoice.
            </p>
            <div className="mt-3 flex justify-center">
              <InvoiceQrCode url={`/invoice/${token}`} size={144} />
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="space-y-2 no-print">
            {invoice.whatsappInvoiceUrl ? (
              <a
                href={invoice.whatsappInvoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#22c55e] px-4 text-sm font-bold text-white"
              >
                <MessageCircle className="size-4" />
                Kirim Link Invoice WA
              </a>
            ) : null}
            <InvoicePrintButton />
          </div>

          {/* ── Print info ── */}
          <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-xs leading-5 text-[#b8b8bf] no-print">
            <FileText className="mb-2 size-4 text-[#f5a742]" />
            Link ini khusus tracking invoice customer. Export PDF memakai dialog print browser dengan pilihan{" "}
            <strong className="text-white">Save as PDF</strong>.
          </div>

        </aside>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[#34343c] py-6 text-center">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {/* Thank you + tagline */}
          <div className="print-only mb-4" style={{ display: "none" }}>
            <p className="text-sm font-semibold text-gray-800">
              Terima kasih atas kunjungan Anda!
            </p>
            <p className="mt-1 text-xs text-gray-500">
              www.garage.id &nbsp;|&nbsp; GARAGE Coffee &amp; Motor
            </p>
          </div>

          <div className="no-print">
            <div className="mb-3 flex items-center justify-center gap-2">
              <Star className="size-3 text-[#f5a742]" />
              <span className="text-xs font-semibold uppercase tracking-widest text-[#f5a742]">
                GARAGE Coffee &amp; Motor
              </span>
              <Star className="size-3 text-[#f5a742]" />
            </div>
            <p className="text-xs text-[#8f8f99]">
              Terima kasih atas kunjungan Anda. Jika puas, silakan tinggalkan review di Google. 🙏
            </p>
            <p className="mt-1 text-[10px] text-[#8f8f99]">
              www.garage.id &nbsp;&bull;&nbsp; Pesanan yang sudah dibuat tidak dapat dikembalikan.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ─── Invoice Tracking Timeline ───
function InvoiceTrackingTimeline({
  activeStep,
  orderCreatedAt,
  orderUpdatedAt,
}: {
  activeStep: number;
  orderCreatedAt: string;
  orderUpdatedAt: string;
}) {
  if (activeStep < 0) {
    return (
      <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/16 text-[#ffc2c8]">
            <FileText className="size-5" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ffc2c8]">
              Order Ditolak
            </p>
            <p className="mt-1 text-sm leading-6 text-[#ffe1e5]">
              Pesanan ditolak kasir. Silakan hubungi outlet jika butuh bantuan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
            Tracking Pesanan
          </p>
          <h2 className="mt-1 text-base font-bold text-white sm:text-lg">
            {trackingSteps[activeStep]?.label ?? "Diproses Kasir"}
          </h2>
          <p className="mt-0.5 text-xs text-[#8f8f99]">
            {STEP_LABELS[trackingSteps[activeStep]?.id] ?? ""} &bull;{" "}
            {activeStep > 0 ? `Step ${activeStep + 1} dari ${trackingSteps.length}` : "Step 1"}
          </p>
        </div>
        <span className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-2 py-1 font-mono text-[10px] text-[#ffd79a]">
          {Math.min(activeStep + 1, trackingSteps.length)} / {trackingSteps.length}
        </span>
      </div>

      {/* Desktop timeline — horizontal steps */}
      <div className="hidden grid-cols-6 gap-2 md:grid">
        {trackingSteps.map((step, index) => (
          <TrackingStep
            key={step.id}
            step={step}
            state={stepState(index, activeStep)}
            timestamp={index === 0 ? dateTime(orderCreatedAt) : index === activeStep ? dateTime(orderUpdatedAt) : undefined}
          />
        ))}
      </div>

      {/* Mobile timeline — vertical */}
      <div className="space-y-3 md:hidden">
        {trackingSteps.map((step, index) => (
          <TrackingStep
            key={step.id}
            step={step}
            state={stepState(index, activeStep)}
            mobile
            timestamp={index === 0 ? dateTime(orderCreatedAt) : index === activeStep ? dateTime(orderUpdatedAt) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function stepState(index: number, activeStep: number) {
  if (index < activeStep) return "done";
  if (index === activeStep) return "active";
  return "pending";
}

function TrackingStep({
  step,
  state,
  mobile = false,
  timestamp,
}: {
  step: (typeof trackingSteps)[number];
  state: "done" | "active" | "pending";
  mobile?: boolean;
  timestamp?: string;
}) {
  const Icon = step.icon;
  const tone =
    state === "done"
      ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]"
      : state === "active"
        ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffe7b8]"
        : "border-[#34343c] bg-white/[0.035] text-[#8f8f99]";
  const dotTone =
    state === "done"
      ? "border-[#22c55e]/50 bg-[#22c55e]/18 text-[#dcfce7]"
      : state === "active"
        ? "border-[#f5a742]/60 bg-[#f5a742]/18 text-[#ffd79a]"
        : "border-[#4a4a54] bg-[#111116] text-[#8f8f99]";

  return (
    <div
      className={`rounded-md border p-3 ${tone} ${
        mobile ? "flex items-start gap-3" : "min-h-[160px]"
      }`}
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${dotTone}`}
      >
        <Icon className="size-4" />
      </div>
      <div className={mobile ? "min-w-0 flex-1" : "mt-3"}>
        <p className="text-sm font-bold text-current">{step.label}</p>
        <p className="mt-1 text-xs leading-5 text-current/75">{step.description}</p>
        {timestamp && mobile && (
          <p className="mt-1 text-[10px] text-[#8f8f99]">{timestamp}</p>
        )}
      </div>
      {timestamp && !mobile && (
        <p className="mt-2 text-[10px] text-[#8f8f99]">{timestamp}</p>
      )}
    </div>
  );
}

// ─── Helper components ───
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#1b1b21] p-3">
      <p className="text-xs text-[#b8b8bf]">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
  discount = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  discount?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={
          strong
            ? "font-bold text-white"
            : discount
              ? "text-[#22c55e]"
              : "text-[#b8b8bf]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "invoice-grand-total-value text-lg font-black text-[#ffd79a]"
            : discount
              ? "font-semibold text-[#22c55e]"
              : "font-semibold text-white"
        }
      >
        {value}
      </span>
    </div>
  );
}
