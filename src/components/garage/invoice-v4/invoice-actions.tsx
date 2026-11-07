"use client";

import { useEffect, useState } from "react";
import { Check, FileDown, MessageCircle, Printer, Share2 } from "lucide-react";

import { trackCxEvent } from "@/lib/cx-events";

/** Event global agar tombol "Hubungi Kasir" di header membuka sheet WhatsApp. */
export const OPEN_WA_EVENT = "iv:open-whatsapp";

function invoiceUrl(token: string) {
  return `${window.location.origin}/invoice/${token}`;
}

/** Bagikan / Simpan PDF / Cetak / Hubungi Kasir. PDF = dialog cetak browser (Save as PDF). */
export function InvoiceActions({
  token,
  orderNo,
  variant = "header",
}: {
  token: string;
  orderNo: string;
  variant?: "header" | "stack";
}) {
  const [copied, setCopied] = useState(false);

  // Kompatibel dengan link lama `?print=1` (dulu InvoicePrintButton).
  useEffect(() => {
    if (variant !== "header") return;
    if (new URLSearchParams(window.location.search).get("print") !== "1") return;
    const timeout = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timeout);
  }, [variant]);

  async function share() {
    trackCxEvent(token, "invoice_shared");
    const url = invoiceUrl(token);
    const data = { title: `Invoice Garage Coffee ${orderNo}`, text: `Invoice & tracking pesanan ${orderNo}`, url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Salin link invoice:", url);
    }
  }

  function print() {
    trackCxEvent(token, "invoice_pdf_saved");
    window.print();
  }

  function contact() {
    window.dispatchEvent(new CustomEvent(OPEN_WA_EVENT));
  }

  if (variant === "stack") {
    return (
      <div className="grid gap-2 iv-no-print">
        <button type="button" className="iv-btn iv-btn-secondary iv-btn-block justify-start" onClick={() => void share()}>
          {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          <span>{copied ? "Link invoice disalin" : "Bagikan Invoice"}</span>
        </button>
        <button type="button" className="iv-btn iv-btn-secondary iv-btn-block justify-start" onClick={() => print()}>
          <FileDown className="size-4" aria-hidden />
          <span>Simpan PDF</span>
        </button>
        <button type="button" className="iv-btn iv-btn-secondary iv-btn-block justify-start" onClick={() => print()}>
          <Printer className="size-4" aria-hidden />
          <span>Cetak Invoice</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 iv-no-print">
      <button type="button" className="iv-btn iv-btn-ghost iv-btn-sm hidden md:inline-flex" onClick={() => void share()}>
        {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
        <span>{copied ? "Disalin" : "Bagikan"}</span>
      </button>
      <button type="button" className="iv-btn iv-btn-ghost iv-btn-sm hidden lg:inline-flex" onClick={() => print()}>
        <FileDown className="size-4" aria-hidden />
        <span>Simpan PDF</span>
      </button>
      <button type="button" className="iv-btn iv-btn-ghost iv-btn-sm hidden lg:inline-flex" onClick={() => print()}>
        <Printer className="size-4" aria-hidden />
        <span>Cetak</span>
      </button>
      <button
        type="button"
        className="iv-btn iv-btn-ghost iv-btn-sm md:hidden"
        aria-label={copied ? "Link invoice disalin" : "Bagikan invoice"}
        onClick={() => void share()}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      </button>
      <button type="button" className="iv-btn iv-btn-primary iv-btn-sm" onClick={contact}>
        <MessageCircle className="size-4" aria-hidden />
        <span className="hidden sm:inline">Hubungi Kasir</span>
        <span className="sm:hidden">Kasir</span>
      </button>
    </div>
  );
}
