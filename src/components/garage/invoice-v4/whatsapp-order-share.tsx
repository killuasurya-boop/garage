"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, ExternalLink, FileDown, ImageUp, Info, Loader2, MessageCircle } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { buildInvoiceConfirmationMessage, buildPaymentProofMessage, cashierWaLink } from "@/lib/cx-whatsapp";
import { trackCxEvent } from "@/lib/cx-events";
import { OPEN_WA_EVENT } from "./invoice-actions";

export type WhatsAppInvoiceData = {
  token: string;
  orderNo: string;
  invoiceNo: string;
  customerName: string | null;
  tableLabel: string | null;
  fulfillmentLabel: string;
  total: number;
  paymentMethod: string | null;
  paymentStatusLabel: string;
  cashierWhatsapp: string;
};

function invoiceUrl(token: string) {
  return typeof window === "undefined" ? `/invoice/${token}` : `${window.location.origin}/invoice/${token}`;
}

type OpenState = "idle" | "opening" | "opened";

/** Tombol buka WA + status jujur: "WhatsApp dibuka", bukan "terkirim". */
function OpenWhatsappButton({ href, onOpen, label }: { href: string | null; onOpen: () => void; label: string }) {
  const [state, setState] = useState<OpenState>("idle");
  useEffect(() => {
    if (state !== "opening") return;
    const timer = window.setTimeout(() => setState("opened"), 1200);
    return () => window.clearTimeout(timer);
  }, [state]);
  if (!href) {
    return <p className="text-sm text-[var(--iv-red-text)]">Nomor WhatsApp kasir belum diatur. Hubungi kasir langsung.</p>;
  }
  return (
    <div className="grid gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="iv-btn iv-btn-wa iv-btn-block"
        onClick={() => {
          setState("opening");
          onOpen();
        }}
      >
        {state === "opening" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}
        <span>{state === "opening" ? "Membuka WhatsApp…" : label}</span>
        <ExternalLink className="size-4" aria-hidden />
      </a>
      <p role="status" className="text-center text-[12.5px] text-[var(--iv-text-3)]">
        {state === "opened"
          ? "WhatsApp sudah dibuka. Pastikan Anda menekan Kirim di WhatsApp."
          : "Pesan baru terkirim setelah Anda menekan Kirim di WhatsApp."}
      </p>
    </div>
  );
}

/** SECTION 05 — Kirim Bukti Pesanan ke WhatsApp Kasir (wa.me, teks saja). */
export function WhatsAppOrderShare({ data }: { data: WhatsAppInvoiceData }) {
  const [open, setOpen] = useState(false);
  const [includeName, setIncludeName] = useState(Boolean(data.customerName));
  const reduce = useReducedMotion();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_WA_EVENT, handler);
    return () => window.removeEventListener(OPEN_WA_EVENT, handler);
  }, []);

  const message = useMemo(
    () =>
      buildInvoiceConfirmationMessage({
        orderNo: data.orderNo,
        invoiceNo: data.invoiceNo,
        customerName: data.customerName,
        includeName,
        tableLabel: data.tableLabel,
        fulfillmentLabel: data.fulfillmentLabel,
        total: data.total,
        paymentMethod: data.paymentMethod,
        paymentStatusLabel: data.paymentStatusLabel,
        invoiceUrl: invoiceUrl(data.token),
      }),
    [data, includeName],
  );
  const href = cashierWaLink(message, data.cashierWhatsapp);

  return (
    <>
      <motion.button
        type="button"
        className="iv-wa iv-no-print"
        whileTap={reduce ? undefined : { scale: 0.985 }}
        onClick={() => setOpen(true)}
      >
        <span className="iv-wa-icon">
          <MessageCircle className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">Kirim Bukti Pesanan ke WhatsApp Kasir</span>
          <span className="mt-0.5 block text-[12.5px] text-[var(--iv-text-2)]">Simpan dan konfirmasi pesanan Anda dengan mudah.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--iv-green-text)]" aria-hidden />
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="iv-sheet mx-auto max-h-[92svh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl border-[var(--iv-border-strong)] bg-[var(--iv-surface)] p-0 text-[var(--iv-cream)]"
        >
          <div className="grid gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="pr-10">
              <SheetTitle className="iv-heading text-lg">Kirim ke WhatsApp Kasir</SheetTitle>
              <SheetDescription className="mt-1 text-[13px] text-[var(--iv-text-2)]">
                Pesan berisi data invoice asli. Cek dulu, lalu kirim sendiri dari WhatsApp.
              </SheetDescription>
            </div>
            <WhatsAppMessagePreview message={message} />
            {data.customerName ? (
              <label className="iv-check">
                <input type="checkbox" checked={includeName} onChange={(event) => setIncludeName(event.target.checked)} />
                <span>Sertakan nama saya ({data.customerName})</span>
              </label>
            ) : null}
            <OpenWhatsappButton href={href} label="Buka WhatsApp" onOpen={() => trackCxEvent(data.token, "whatsapp_order_clicked")} />
            <div className="iv-subcard flex gap-3 p-3 text-[12.5px] leading-5 text-[var(--iv-text-2)]">
              <Info className="mt-0.5 size-4 shrink-0 text-[var(--iv-amber)]" aria-hidden />
              <p>
                Link WhatsApp hanya mengisi teks. Untuk melampirkan PDF/gambar invoice, tekan{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--iv-cream)] underline underline-offset-2"
                  onClick={() => {
                    trackCxEvent(data.token, "invoice_pdf_saved");
                    setOpen(false);
                    window.setTimeout(() => window.print(), 250);
                  }}
                >
                  Simpan PDF
                </button>{" "}
                lalu lampirkan manual di chat.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function WhatsAppMessagePreview({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-[#0b141a] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8fa6b2]">Preview pesan</p>
      <div className="iv-msg-preview">{message}</div>
    </div>
  );
}

/**
 * "Saya sudah bayar" → BUKAN konfirmasi pembayaran. Membantu pelanggan mengirim
 * screenshot bukti ke kasir; status Lunas hanya setelah kasir memverifikasi.
 */
export function WhatsAppPaymentProofHelp({
  data,
  open,
  onOpenChange,
}: {
  data: WhatsAppInvoiceData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const message = useMemo(
    () =>
      buildPaymentProofMessage({
        orderNo: data.orderNo,
        invoiceNo: data.invoiceNo,
        total: data.total,
        paymentMethod: data.paymentMethod,
        invoiceUrl: invoiceUrl(data.token),
      }),
    [data],
  );
  const href = cashierWaLink(message, data.cashierWhatsapp);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="iv-sheet mx-auto max-h-[92svh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl border-[var(--iv-border-strong)] bg-[var(--iv-surface)] p-0 text-[var(--iv-cream)]"
      >
        <div className="grid gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="pr-10">
            <SheetTitle className="iv-heading text-lg">Kirim Bukti Pembayaran</SheetTitle>
            <SheetDescription className="mt-1 text-[13px] text-[var(--iv-text-2)]">
              Status tetap <strong className="text-[var(--iv-cream)]">{data.paymentStatusLabel}</strong> sampai kasir
              memverifikasi pembayaran Anda.
            </SheetDescription>
          </div>
          <ol className="grid gap-2 text-[13.5px] text-[var(--iv-text-2)]">
            <li className="flex gap-3">
              <span className="iv-pill" data-tone="muted">1</span>
              <span>Simpan screenshot bukti pembayaran dari aplikasi bank/e-wallet.</span>
            </li>
            <li className="flex gap-3">
              <span className="iv-pill" data-tone="muted">2</span>
              <span>Buka WhatsApp kasir — pesan dengan nomor order sudah terisi.</span>
            </li>
            <li className="flex gap-3">
              <span className="iv-pill" data-tone="muted">3</span>
              <span className="flex items-center gap-1.5">
                Lampirkan screenshot di chat <ImageUp className="size-4 text-[var(--iv-text-3)]" aria-hidden /> lalu kirim.
              </span>
            </li>
          </ol>
          <WhatsAppMessagePreview message={message} />
          <OpenWhatsappButton
            href={href}
            label="Buka WhatsApp Kasir"
            onOpen={() => trackCxEvent(data.token, "whatsapp_payment_help_clicked")}
          />
          <p className="flex items-start gap-2 text-[12.5px] text-[var(--iv-text-3)]">
            <FileDown className="mt-0.5 size-4 shrink-0" aria-hidden />
            Halaman ini diperbarui otomatis; status berubah menjadi Lunas setelah kasir mengonfirmasi.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
