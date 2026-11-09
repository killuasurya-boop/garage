import { SuryaDeveloperCredit } from "@/components/surya/surya-developer-credit";
import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, CreditCard, FileText, MapPin, ReceiptText, Star, Utensils } from "lucide-react";

import { CinematicInvoiceHero } from "@/components/garage/invoice-v4/cinematic-invoice-hero";
import { InvoiceActions } from "@/components/garage/invoice-v4/invoice-actions";
import { InvoiceLiveTrackerV4 } from "@/components/garage/invoice-v4/invoice-live-tracker";
import { InvoiceMembership } from "@/components/garage/invoice-v4/invoice-membership";
import { InvoiceMotion } from "@/components/garage/invoice-v4/invoice-motion";
import { InvoiceQrisCard } from "@/components/garage/invoice-v4/invoice-qris-card";
import { BenefitIcon } from "@/components/garage/invoice-v4/member-offers";
import { WhatsAppOrderShare, type WhatsAppInvoiceData } from "@/components/garage/invoice-v4/whatsapp-order-share";
import "@/components/garage/invoice-v4/invoice-v4.css";
import { verifiedTierBenefits } from "@/lib/customer-offers";
import { cashierWhatsappNumber } from "@/lib/cx-whatsapp";
import { GARAGE_LOCATION } from "@/lib/garage-location";
import { getAppSettings, getInvoiceLiveStatus, getPublicInvoiceTracking } from "@/lib/garage-service";
import {
  fulfillmentLabel,
  INVOICE_PAYMENT_LABEL,
  invoiceNeedsPayment,
  invoicePaymentState,
  maskPhone,
  type FulfillmentKind,
  type InvoicePaymentState,
} from "@/lib/invoice-v4";
import { componentLabel, groupOrderLines } from "@/lib/order-package-lines";
import { InvoiceContact } from "./invoice-contact";
import { InvoiceQrCode } from "./invoice-qr";

// Invoice Digital V4 — Customer Experience Engine (owner, Nov 2026).
// Satu invoice: tagihan, QRIS, tracking, WhatsApp kasir, membership, promo.
// Nilai uang & status selalu dari data order/pembayaran asli (tidak ada "Lunas" palsu).

export const metadata: Metadata = {
  title: "Invoice Digital - Garage Coffee",
  description: "Invoice, pembayaran, dan tracking pesanan Garage Coffee.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "-";
  return `${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value))} WIB`;
}

const PILL_TONE: Record<InvoicePaymentState, string> = {
  paid: "paid",
  pending: "pending",
  awaiting_confirmation: "awaiting",
  failed: "pending",
  cancelled: "muted",
  refund: "muted",
};

export default async function InvoiceTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invoice, liveStatus] = await Promise.all([getPublicInvoiceTracking(token), getInvoiceLiveStatus(token)]);
  if (!invoice) notFound();

  const settings = await getAppSettings(invoice.outletId);
  const paymentState = invoicePaymentState({
    orderStatus: invoice.orderStatus,
    paymentStatus: invoice.payment.status,
    paymentMethod: invoice.payment.method,
    invoiceStatus: invoice.invoiceStatus,
  });
  const paid = paymentState === "paid";
  const needsPayment = invoiceNeedsPayment(paymentState);
  const fulfillment = (liveStatus?.fulfillment ?? null) as FulfillmentKind | null;
  const kindLabel = fulfillmentLabel(fulfillment, null);
  const methodLabel =
    invoice.payment.staffOrder && !paid ? "Belum dipilih" : invoice.payment.method?.trim() || (paid ? "-" : "Belum dipilih");
  const lines = groupOrderLines(invoice.items);
  const itemCount = invoice.items.reduce((sum, item) => sum + item.qty, 0);
  const benefits = verifiedTierBenefits(
    "Silver",
    {
      pointsPerThousand: Number(settings.pointsPerThousand ?? 0),
      pointValue: Number(settings.memberPointValue ?? 0),
      redeemMaxPct: Number(settings.memberRedeemMaxPct ?? 0),
      redeemMinPoints: Number(settings.memberRedeemMinPoints ?? 0),
    },
    { includeWelcome: true },
  );

  const waData: WhatsAppInvoiceData = {
    token,
    orderNo: invoice.orderNo,
    invoiceNo: invoice.invoiceNo,
    customerName: invoice.customer.name?.trim() || null,
    tableLabel: fulfillment === "delivery" || fulfillment === "takeaway" ? null : invoice.tableLabel,
    fulfillmentLabel: kindLabel,
    total: invoice.total,
    paymentMethod: methodLabel === "Belum dipilih" ? null : methodLabel,
    paymentStatusLabel: INVOICE_PAYMENT_LABEL[paymentState],
    cashierWhatsapp: cashierWhatsappNumber(settings.garageWhatsapp),
  };
  const maskedPhone = maskPhone(invoice.customer.phone);

  return (
    <main className="iv-root">
      <Suspense fallback={null}>
        <InvoiceMotion token={token} />
      </Suspense>

      {/* ── SECTION 01 — Header ── */}
      <header className="iv-header">
        <div className="iv-container iv-header-inner">
          <div className="flex min-w-0 items-center gap-4 lg:gap-8">
            <Image
              src="/garage-brand/garage-coffee-logo.png"
              alt="Garage Coffee"
              width={180}
              height={60}
              priority
              className="h-9 w-auto object-contain sm:h-10"
            />
            <span className="iv-nav-tab hidden sm:inline">Invoice Digital</span>
          </div>
          <InvoiceActions token={token} orderNo={invoice.orderNo} />
        </div>
      </header>

      {/* Print header (A4 terang) */}
      <div className="iv-print-only iv-container pt-2">
        <div className="flex items-center justify-between border-b-2 border-black pb-2">
          <Image src="/garage-brand/garage-coffee-logo-dark.png" alt="Garage Coffee" width={200} height={66} className="h-12 w-auto object-contain" />
          <div className="text-right text-xs">
            <p className="font-bold">INVOICE {invoice.invoiceNo}</p>
            <p>Order {invoice.orderNo}</p>
            <p>{GARAGE_LOCATION.phoneDisplay} · garagecoffee.id</p>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-[var(--iv-border)] iv-no-print">
        <div className="iv-container relative z-[1] flex min-h-[112px] items-center py-5 md:min-h-[150px] lg:min-h-[176px]">
          <div className="max-w-xl">
            <h1 className="iv-heading text-[28px] leading-none sm:text-[36px] lg:text-[44px]">
              Invoice <span className="text-[var(--iv-red)]">Digital</span>
            </h1>
            <p className="mt-2 text-[13px] text-[var(--iv-text-2)] sm:text-[14px]">
              Transaksi • Pembayaran • Tracking • Member • Reward
            </p>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] md:block" aria-hidden>
          <Image
            src="/garage-brand/member/member-scene.webp"
            alt=""
            fill
            sizes="46vw"
            className="object-cover object-[center_60%] opacity-80 [mask-image:linear-gradient(90deg,transparent,black_45%)]"
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-[38%] hidden w-[22%] lg:block">
          <CinematicInvoiceHero />
        </div>
      </section>

      {/* ── Grid utama: mobile 1 kolom (urutan spesifikasi), tablet 2, desktop 3 ── */}
      <div className="iv-container py-5 lg:py-6">
        <div className="iv-print-grid grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)_minmax(0,360px)] xl:grid-cols-[360px_minmax(0,1fr)_390px]">
          {/* Kolom A */}
          <div className="contents md:flex md:flex-col md:gap-4">
            {/* SECTION 02 — Payment hero */}
            <section className="iv-card iv-card-pad iv-reveal order-1" aria-labelledby="iv-invoice-title">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--iv-cream)]">
                  <ReceiptText className="size-4 text-[var(--iv-red)]" aria-hidden /> Invoice Digital
                </p>
                <span className="iv-pill" data-tone="outline">
                  {kindLabel}
                </span>
              </div>
              <h2 id="iv-invoice-title" className="iv-heading mt-3 break-all text-[20px] leading-tight sm:text-[22px]">
                {invoice.invoiceNo}
              </h2>
              <p className="mt-1 text-[13px] text-[var(--iv-text-2)]">Order: {invoice.orderNo}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {invoice.tableLabel && fulfillment !== "delivery" && fulfillment !== "takeaway" ? (
                  <span className="iv-chip">
                    <Utensils className="size-3.5" aria-hidden /> {invoice.tableLabel}
                  </span>
                ) : null}
                <span className="iv-chip">
                  <CalendarDays className="size-3.5" aria-hidden /> {dateLabel(invoice.createdAt)}
                </span>
                <span className="iv-chip">
                  <Clock3 className="size-3.5" aria-hidden /> {timeLabel(invoice.createdAt)}
                </span>
              </div>

              <div className="iv-total mt-4 p-4" data-state={paid ? "paid" : "open"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--iv-text-2)]">Total Tagihan</p>
                  <span className="iv-pill" data-tone={PILL_TONE[paymentState]} role="status">
                    {INVOICE_PAYMENT_LABEL[paymentState]}
                  </span>
                </div>
                <p className="iv-money mt-1.5 text-[30px] leading-none text-[var(--iv-cream)] sm:text-[34px]">{rupiah(invoice.total)}</p>
              </div>

              <dl className="mt-3 grid gap-2 text-[13.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-[var(--iv-text-2)]">
                    <CreditCard className="size-4 text-[var(--iv-text-3)]" aria-hidden /> Metode Pembayaran
                  </dt>
                  <dd className="font-semibold text-[var(--iv-cream)]">{methodLabel}</dd>
                </div>
                {paid && invoice.payment.paidAt ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--iv-text-2)]">Waktu Pembayaran</dt>
                    <dd className="font-semibold text-[var(--iv-cream)]">{timeLabel(invoice.payment.paidAt)}</dd>
                  </div>
                ) : null}
                {paymentState === "awaiting_confirmation" ? (
                  <p className="text-[12.5px] text-[var(--iv-amber)]">Kasir sedang mengecek pembayaran Anda.</p>
                ) : null}
              </dl>
            </section>

            {/* QRIS fallback — hanya saat belum lunas */}
            {needsPayment ? (
              <div className="order-2">
                <InvoiceQrisCard data={waData} />
              </div>
            ) : null}

            {/* SECTION 05 — WhatsApp */}
            <div className="iv-reveal order-5">
              <WhatsAppOrderShare data={waData} />
            </div>

            {/* SECTION 09 — Aksi pelanggan */}
            <section className="iv-card iv-card-pad iv-reveal order-8 grid gap-3 iv-no-print" aria-label="Aksi invoice">
              <InvoiceActions token={token} orderNo={invoice.orderNo} variant="stack" />
              <a
                href={GARAGE_LOCATION.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="iv-btn iv-btn-secondary iv-btn-block justify-start"
              >
                <MapPin className="size-4" aria-hidden /> Lihat Lokasi Outlet
              </a>
              {paid && liveStatus && ["delivered", "completed"].includes(liveStatus.kitchenStatus) ? (
                <a href={GARAGE_LOCATION.reviewUrl} target="_blank" rel="noopener noreferrer" className="iv-btn iv-btn-primary iv-btn-block">
                  <Star className="size-4" aria-hidden /> Tulis Ulasan di Google
                </a>
              ) : null}
              <div className="iv-divider pt-3">
                <InvoiceContact
                  token={token}
                  orderId={invoice.id}
                  orderNo={invoice.orderNo}
                  label={fulfillment === "delivery" ? "Delivery" : fulfillment === "takeaway" ? "Take away" : (invoice.tableLabel ?? "Pelanggan")}
                />
              </div>
              <div className="flex items-center gap-3">
                <InvoiceQrCode url={`/invoice/${token}`} size={84} />
                <p className="text-[12.5px] leading-5 text-[var(--iv-text-2)]">
                  Scan untuk membuka invoice & tracking ini di HP lain. Link bersifat pribadi — bagikan hanya ke orang yang Anda percaya.
                </p>
              </div>
            </section>
          </div>

          {/* Kolom B + C (tablet: satu kolom; desktop: dua kolom) */}
          <div className="contents md:flex md:flex-col md:gap-4 lg:contents">
            <div className="contents lg:flex lg:flex-col lg:gap-4">
              {/* SECTION 03 — Tracking */}
              <div className="order-3 iv-no-print">
                {liveStatus ? (
                  <InvoiceLiveTrackerV4 token={token} initialStatus={liveStatus} />
                ) : (
                  <section className="iv-card iv-card-pad text-[13px] text-[var(--iv-text-2)]">Status pesanan belum tersedia.</section>
                )}
              </div>

              {/* SECTION 04 — Detail pesanan */}
              <section className="iv-card iv-card-pad iv-reveal order-4" aria-labelledby="iv-items-title">
                <h2 id="iv-items-title" className="iv-card-title">
                  <FileText className="size-5" aria-hidden />
                  Detail Pesanan <span className="text-[13px] font-semibold text-[var(--iv-text-3)]">({itemCount} item)</span>
                </h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="iv-items min-w-[420px]">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col" className="iv-num">Qty</th>
                        <th scope="col" className="iv-num">Harga</th>
                        <th scope="col" className="iv-num">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((group) =>
                        group.kind === "package" ? (
                          <tr key={group.groupId}>
                            <td>
                              <span className="font-semibold">{group.name}</span>{" "}
                              <span className="iv-pill ml-1 !min-h-0 !px-2 !py-0.5 !text-[11px]" data-tone="awaiting">
                                Paket
                              </span>
                              <ul className="mt-1 text-[12.5px] text-[var(--iv-text-2)]">
                                {group.components.map((line) => (
                                  <li key={line.id}>– {componentLabel(line, group.qty)}</li>
                                ))}
                              </ul>
                            </td>
                            <td className="iv-num">{group.qty}</td>
                            <td className="iv-num">{rupiah(Math.round(group.total / Math.max(1, group.qty)))}</td>
                            <td className="iv-num font-semibold">{rupiah(group.total)}</td>
                          </tr>
                        ) : (
                          <tr key={group.line.id}>
                            <td>
                              <span className="font-semibold">{group.line.itemName}</span>
                              {group.line.variantLabel && group.line.variantLabel !== "Regular" ? (
                                <span className="text-[var(--iv-text-2)]"> · {group.line.variantLabel}</span>
                              ) : null}
                              {group.line.note ? <p className="mt-0.5 text-[12px] italic text-[var(--iv-amber)]">{group.line.note}</p> : null}
                            </td>
                            <td className="iv-num">{group.line.qty}</td>
                            <td className="iv-num">{rupiah(group.line.unitPrice)}</td>
                            <td className="iv-num font-semibold">{rupiah(group.line.lineTotal)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <dl className="iv-divider mt-3 grid gap-1.5 pt-3 text-[14px]">
                  <SummaryRow label="Subtotal" value={rupiah(invoice.subtotal)} />
                  {invoice.service > 0 ? <SummaryRow label="Service" value={rupiah(invoice.service)} /> : null}
                  {invoice.tax > 0 ? <SummaryRow label="PB1" value={rupiah(invoice.tax)} /> : null}
                  {invoice.service <= 0 && invoice.tax <= 0 ? <SummaryRow label="Pajak / Service" value={rupiah(0)} /> : null}
                  {invoice.discount > 0 ? <SummaryRow label="Diskon" value={`-${rupiah(invoice.discount)}`} accent /> : null}
                  {invoice.deliveryFee > 0 ? <SummaryRow label="Ongkir delivery" value={rupiah(invoice.deliveryFee)} /> : null}
                  <div className="iv-divider mt-1.5 flex items-center justify-between gap-3 pt-2.5">
                    <dt className="iv-heading text-[17px]">Total Tagihan</dt>
                    <dd className="iv-money text-[20px] text-[var(--iv-cream)]">{rupiah(invoice.total)}</dd>
                  </div>
                  {invoice.payment.method === "Cash" && paid && invoice.payment.cashReceived ? (
                    <>
                      <SummaryRow label="Tunai" value={rupiah(invoice.payment.cashReceived)} />
                      <SummaryRow label="Kembalian" value={rupiah(Math.max(0, invoice.payment.cashReceived - invoice.total))} />
                    </>
                  ) : null}
                </dl>
                {invoice.customer.name || maskedPhone || invoice.customer.note ? (
                  <div className="iv-subcard mt-3 grid gap-1 p-3 text-[13px]">
                    {invoice.customer.name ? (
                      <p>
                        <span className="text-[var(--iv-text-3)]">Atas nama:</span> <span className="font-semibold">{invoice.customer.name}</span>
                      </p>
                    ) : null}
                    {maskedPhone ? <p className="text-[var(--iv-text-2)]">WA {maskedPhone}</p> : null}
                    {invoice.customer.note ? <p className="text-[var(--iv-text-2)]">Catatan: {invoice.customer.note}</p> : null}
                  </div>
                ) : null}
              </section>
            </div>

            {/* SECTION 06–08 — Membership & promo */}
            <div className="order-6 lg:flex lg:flex-col lg:gap-4">
              <InvoiceMembership token={token} customerName={invoice.customer.name?.trim() || null} />
            </div>
          </div>
        </div>

        {/* Mengapa jadi member — benefit terverifikasi dari aturan aktif */}
        <section className="iv-card iv-card-pad iv-reveal mt-4 iv-no-print" aria-labelledby="iv-why-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <h2 id="iv-why-title" className="iv-heading flex shrink-0 items-center gap-2 text-[18px]">
              <Star className="size-5 text-[var(--iv-red)]" aria-hidden /> Mengapa Jadi Member?
            </h2>
            <ul className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {benefits.map((benefit) => (
                <li key={benefit.key} className="flex items-start gap-3 lg:border-l lg:border-[var(--iv-border)] lg:pl-4">
                  <BenefitIcon benefitKey={benefit.key} className="mt-0.5 size-5 shrink-0 text-[var(--iv-red-text)]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold">{benefit.title}</p>
                    <p className="text-[12.5px] leading-5 text-[var(--iv-text-2)]">{benefit.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ── SECTION 10 — Footer ── */}
      <footer className="border-t border-[var(--iv-border)] py-6">
        <div className="iv-container flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image src="/garage-brand/garage-coffee-logo.png" alt="Garage Coffee" width={140} height={46} className="h-9 w-auto object-contain iv-no-print" />
            <div className="text-[13px] text-[var(--iv-text-2)] sm:border-l sm:border-[var(--iv-border)] sm:pl-4">
              <p>Terima kasih telah berkunjung ke Garage Coffee.</p>
              <p>Sampai jumpa di kunjungan berikutnya!</p>
            </div>
          </div>
          <div className="text-[13px] text-[var(--iv-text-2)] sm:text-right">
            <p className="font-semibold text-[var(--iv-cream)]">garagecoffee.id</p>
            <p>
              {GARAGE_LOCATION.phoneDisplay} · Jl. Mayjen Sutoyo, Tebing Tinggi
            </p>
          </div>
        </div>
      </footer>
      <div className="px-4 pb-8 pt-2">
        <SuryaDeveloperCredit variant="invoice" />
      </div>
    </main>
  );
}

function SummaryRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--iv-text-2)]">{label}</dt>
      <dd className={`iv-num font-semibold ${accent ? "text-[var(--iv-green-text)]" : "text-[var(--iv-cream)]"}`}>{value}</dd>
    </div>
  );
}
