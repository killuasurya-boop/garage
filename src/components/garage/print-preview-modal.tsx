"use client";

import { useEffect, useRef, useState } from "react";
import {
  Printer,
  X,
} from "lucide-react";

import type { OrderReceipt } from "@/lib/garage-api-types";

interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  receipt: OrderReceipt;
  mode: "thermal" | "invoice";
}

export function PrintPreviewModal({
  open,
  onClose,
  receipt,
  mode,
}: PrintPreviewModalProps) {
  const printRootRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<"thermal" | "invoice">(mode);
  const [isPrinting, setIsPrinting] = useState(false);

  // Sync with parent mode changes
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPreviewMode(mode);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mode]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function handlePrint() {
    setIsPrinting(true);
    // Small delay to let UI update
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    }, 100);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const isInvoice = previewMode === "invoice";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Preview Cetak Invoice"
    >
      {/* Modal container */}
      <div className="flex h-full w-full flex-col bg-[#08080a]">

        {/* ── Header toolbar ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#34343c] bg-[#111116] px-4 py-3">
          <div className="flex items-center gap-3">
            <Printer className="size-5 text-[#f5a742]" />
            <div>
              <p className="font-semibold text-white">Preview Cetak</p>
              <p className="font-mono text-xs text-[#8f8f99]">
                {receipt.invoiceNo} &bull; {receipt.orderNo}
              </p>
            </div>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-2 rounded-md border border-[#34343c] bg-[#1b1b21] p-1">
            <button
              type="button"
              onClick={() => setPreviewMode("thermal")}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                previewMode === "thermal"
                  ? "bg-[#f5a742] text-black"
                  : "text-[#b8b8bf] hover:text-white"
              }`}
            >
              Struk 58mm
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("invoice")}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                previewMode === "invoice"
                  ? "bg-[#f5a742] text-black"
                  : "text-[#b8b8bf] hover:text-white"
              }`}
            >
              Invoice A4
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#f5a742] px-4 text-sm font-bold text-black transition-opacity disabled:opacity-50"
            >
              <Printer className="size-4" />
              {isPrinting ? "Printing..." : "Cetak"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md border border-[#34343c] text-[#b8b8bf] transition-colors hover:border-[#4a4a54] hover:text-white"
              aria-label="Tutup preview"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Preview area ── */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-[#1a1a20] p-6">
          <div
            className="garage-print-root"
            ref={printRootRef}
          >
            {/* Thermal / Invoice print content */}
            <PrintablePrintContent receipt={receipt} mode={previewMode} />
          </div>
        </div>

        {/* ── Footer hint ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#34343c] bg-[#111116] px-4 py-2">
          <p className="text-xs text-[#8f8f99]">
            Tekan <kbd className="rounded border border-[#34343c] bg-[#1b1b21] px-1.5 py-0.5 font-mono text-[10px] text-white">Ctrl+P</kbd> atau klik tombol{" "}
            <strong className="text-[#f5a742]">Cetak</strong> di atas untuk mencetak.
          </p>
          <p className="text-xs text-[#8f8f99]">
            {isInvoice
              ? "Ukuran kertas: A4 | Margin: 12mm"
              : "Ukuran kertas: 58mm thermal | Margin: 2mm"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Print Content Component ───
function PrintablePrintContent({
  receipt,
  mode,
}: {
  receipt: OrderReceipt;
  mode: "thermal" | "invoice";
}) {
  const isInvoice = mode === "invoice";

  if (isInvoice) {
    return <InvoicePrintContent receipt={receipt} />;
  }
  return <ThermalPrintContent receipt={receipt} />;
}

function ThermalPrintContent({ receipt }: { receipt: OrderReceipt }) {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  function fmt(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  return (
    <div className="garage-print-thermal">
      {/* Header */}
      <div className="garage-print-header">
        <p className="garage-print-brand">GARAGE</p>
        <p>Coffee &amp; Motor</p>
        <p>{receipt.outlet.name}</p>
      </div>

      {/* Meta */}
      <div className="garage-print-meta">
        <div><span>Invoice</span><strong>{receipt.invoiceNo}</strong></div>
        <div><span>Status</span><strong>{receipt.invoiceStatus}</strong></div>
        <div><span>Order</span><strong>{receipt.orderNo}</strong></div>
        <div><span>KDS</span><strong>{receipt.ticketNos.length > 1 ? receipt.ticketNos.join(", ") : receipt.ticketNo}</strong></div>
        <div><span>Tanggal</span><strong>{fmt(receipt.createdAt)}</strong></div>
        <div><span>Kasir</span><strong>{receipt.cashier.name}</strong></div>
      </div>

      {/* Items */}
      <div className="garage-print-lines">
        {receipt.items.map((item) => (
          <div key={`${item.name}-${item.variant}-${item.qty}`} className="garage-print-line">
            <div>
              <strong>{item.name}</strong>
              <span>{item.variant} x {item.qty} @ {currency.format(item.unitPrice)}</span>
            </div>
            <strong>{currency.format(item.lineTotal)}</strong>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="garage-print-totals">
        <PrintRow label="Subtotal" value={receipt.subtotal} />
        <PrintRow label="Service" value={receipt.service} />
        {receipt.discount > 0 && (
          <PrintRow label="Discount" value={-receipt.discount} />
        )}
        <PrintRow label="Total" value={receipt.total} strong />
      </div>

      {/* Footer */}
      <div className="garage-print-footer">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>GARAGE Coffee &amp; Motor - {receipt.outlet.name}</p>
        {receipt.invoiceWebUrl && <p>{receipt.invoiceWebUrl}</p>}
      </div>
    </div>
  );
}

function InvoicePrintContent({ receipt }: { receipt: OrderReceipt }) {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  function fmt(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  }
  return (
    <div className="garage-print-invoice">
      {/* Invoice Header */}
      <div className="garage-print-invoice-header">
        <div className="garage-print-invoice-brand">
          <p className="garage-print-invoice-brand-name">GARAGE</p>
          <p className="garage-print-invoice-brand-sub">Coffee &amp; Motor</p>
        </div>
        <div className="garage-print-invoice-meta">
          <div><span>INVOICE</span><strong>{receipt.invoiceNo}</strong></div>
          <div><span>Order</span><strong>{receipt.orderNo}</strong></div>
          <div><span>Tanggal</span><strong>{fmt(receipt.createdAt)}</strong></div>
          <div><span>Kasir</span><strong>{receipt.cashier.name}</strong></div>
          <div><span>Status</span><strong>{receipt.invoiceStatus}</strong></div>
          <div><span>KDS</span><strong>{receipt.ticketNos.join(", ")}</strong></div>
        </div>
      </div>

      {/* Outlet info */}
      <div className="garage-print-invoice-outlet">
        <p><strong>{receipt.outlet.name}</strong></p>
        <p>Kode outlet: {receipt.outlet.code}</p>
      </div>

      {/* Customer */}
      {receipt.customer && (
        <div className="garage-print-invoice-customer">
          <p className="garage-print-invoice-section-label">Customer</p>
          <p><strong>{receipt.customer.name}</strong></p>
          <p>{receipt.customer.phone}</p>
        </div>
      )}

      {/* Items table */}
      <table className="garage-print-invoice-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Item</th>
            <th>Harga</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item, i) => (
            <tr key={`${item.name}-${item.variant}-${item.qty}`}>
              <td className="text-center">{i + 1}</td>
              <td>
                <strong>{item.name}</strong>
                <br />
                <span className="text-[10px] opacity-70">{item.variant}</span>
              </td>
              <td className="text-right">{currency.format(item.unitPrice)}</td>
              <td className="text-center">{item.qty}x</td>
              <td className="text-right">{currency.format(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="garage-print-invoice-totals">
        <div className="garage-print-invoice-total-row">
          <span>Subtotal</span>
          <span>{currency.format(receipt.subtotal)}</span>
        </div>
        <div className="garage-print-invoice-total-row">
          <span>Service (5%)</span>
          <span>{currency.format(receipt.service)}</span>
        </div>
        {receipt.discount > 0 && (
          <div className="garage-print-invoice-total-row discount">
            <span>Diskon</span>
            <span>-{currency.format(receipt.discount)}</span>
          </div>
        )}
        {((): boolean => {
          const payment = receipt.payment as { change?: number | null; cashReceived?: number | null };
          return payment.change != null && payment.change > 0;
        })() && (
          <>
            <div className="garage-print-invoice-total-row">
              <span>Tunai</span>
              <span>{currency.format((receipt.payment as { cashReceived?: number }).cashReceived ?? 0)}</span>
            </div>
            <div className="garage-print-invoice-total-row">
              <span>Kembalian</span>
              <span>{currency.format((receipt.payment as { change?: number }).change ?? 0)}</span>
            </div>
          </>
        )}
        <div className="garage-print-invoice-grand-total">
          <span>TOTAL</span>
          <span>{currency.format(receipt.total)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="garage-print-invoice-footer">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>GARAGE Coffee &amp; Motor &bull; {receipt.outlet.name}</p>
        {receipt.invoiceWebUrl && <p>{receipt.invoiceWebUrl}</p>}
      </div>
    </div>
  );
}

function PrintRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  return (
    <div className={`garage-print-total-row ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}
