"use client";

import {
Check,
Copy,
Download,
ExternalLink,
MessageCircle,
Printer,
RefreshCw,
X
} from "lucide-react";
import {
useCallback,
useEffect,
useState
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
OrderReceipt
} from "@/lib/garage-api-types";
import { printThermal } from "@/lib/print-client";
import {
currency
} from "@/lib/garage-data";
import { voice } from "@/lib/garage-voice";
import { buildInvoiceWhatsappMessage, waLink } from "@/lib/whatsapp-link";
import { BillRow, formatReceiptDate } from "@/components/garage/pos/pos-ui-shared";


interface PaymentCompletePanelProps {
  receipt: OrderReceipt;
  autoPrint: boolean;
  onNewTransaction: () => void;
  onClose: () => void;
}

type PrintStatus = "idle" | "printing" | "success" | "error";

export function PaymentCompletePanel({
  receipt,
  autoPrint,
  onNewTransaction,
  onClose,
}: PaymentCompletePanelProps) {
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [printError, setPrintError] = useState("");
  const [waPhone, setWaPhone] = useState(receipt.customer?.phone || "");
  const [waEditing, setWaEditing] = useState(!receipt.customer?.phone);
  const [waSentTo, setWaSentTo] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const invoiceWebUrl = receipt.invoiceWebUrl || null;
  const hasInvoiceLink = Boolean(invoiceWebUrl);
  const invoicePdfUrl = receipt.invoicePdfUrl || null;

  const handlePrint = useCallback(async () => {
    setPrintStatus("printing");
    setPrintError("");
    try {
      const res = await printThermal({
        receipt,
        printerName: receipt.settings?.defaultPrinterName || undefined,
        copies: receipt.settings?.receiptCopies,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok) {
        setPrintStatus("error");
        setPrintError(data.error?.message || data.message || "Gagal mencetak");
        void voice.announce("warning_printer", {
          dedupKey: `print:${receipt.orderNo}`,
        });
      } else {
        setPrintStatus("success");
      }
    } catch {
      setPrintStatus("error");
      setPrintError("Koneksi gagal");
      void voice.announce("warning_printer", {
        dedupKey: `print-exc:${receipt.orderNo}`,
      });
    }
  }, [receipt]);

  useEffect(() => {
    if (!autoPrint) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handlePrint();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoPrint, handlePrint]);

  const buildWaUrl = useCallback(
    (phone: string) => {
      // Kalau backend sudah kasih URL siap-pakai untuk nomor customer terdaftar,
      // dan kasir tidak mengubah nomornya, pakai itu langsung (sudah include
      // template message lengkap dengan link tracking & list item).
      const trimmed = phone.trim();
      const originalPhone = receipt.customer?.phone?.trim();
      if (receipt.whatsappInvoiceUrl && trimmed && trimmed === originalPhone) {
        return receipt.whatsappInvoiceUrl;
      }

      // Bangun dari template bersama (sama dengan waiter & server): item + total + link invoice.
      return (
        waLink(
          trimmed,
          buildInvoiceWhatsappMessage({
            orderNo: receipt.orderNo,
            tableLabel: receipt.tableLabel,
            total: receipt.total,
            items: receipt.items.map((item) => ({
              itemName: item.name,
              variantLabel: item.variant,
              qty: item.qty,
              lineTotal: item.lineTotal,
            })),
            invoiceUrl: invoiceWebUrl,
            paymentMethod: receipt.payment.method,
          }),
        ) ?? `https://wa.me/${normalizeWaNumber(trimmed)}`
      );
    },
    [
      invoiceWebUrl,
      receipt.customer?.phone,
      receipt.items,
      receipt.orderNo,
      receipt.payment.method,
      receipt.tableLabel,
      receipt.total,
      receipt.whatsappInvoiceUrl,
    ],
  );

  const handleSendWhatsapp = useCallback(() => {
    const trimmed = waPhone.trim();
    if (!trimmed && !receipt.whatsappInvoiceUrl) {
      setWaEditing(true);
      return;
    }
    const url = trimmed
      ? buildWaUrl(trimmed)
      : receipt.whatsappInvoiceUrl || buildWaUrl("");
    window.open(url, "garage-whatsapp", "noopener,noreferrer");
    setWaSentTo(trimmed || "WhatsApp");
    setWaEditing(false);
  }, [buildWaUrl, receipt.whatsappInvoiceUrl, waPhone]);

  const handleCopyLink = useCallback(async () => {
    if (!invoiceWebUrl) return;
    try {
      await navigator.clipboard.writeText(invoiceWebUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }, [invoiceWebUrl]);

  const handleOpenInvoice = useCallback(() => {
    if (!invoiceWebUrl) return;
    window.open(invoiceWebUrl, "_blank", "noopener,noreferrer");
  }, [invoiceWebUrl]);

  return (
    <div className="space-y-3">
      {/* Success banner */}
      <div className="flex items-center gap-3 rounded-md border border-[#22c55e]/35 bg-[#22c55e]/12 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#22c55e]/40 bg-[#22c55e]/20">
          <Check className="size-5 text-[#4ade80]" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#4ade80]">Selesai</p>
          <p className="font-black text-white">{receipt.orderNo}</p>
          <p className="mt-0.5 text-sm text-[#b8b8bf]">
            {currency.format(receipt.total)}
          </p>
        </div>
      </div>

      {/* Kembalian tunai — besar supaya kasir tidak salah memberi uang. */}
      {receipt.payment?.cashReceived != null ? (
        <div
          data-testid="payment-complete-change"
          className="rounded-md border-2 border-[#f5a742]/70 bg-[#f5a742]/12 p-4 text-center"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#ffd08a]">Kembalian untuk pelanggan</p>
          <p className="garage-display mt-1 text-5xl font-bold tabular-nums text-white">
            {currency.format(receipt.payment.change ?? 0)}
          </p>
          <p className="mt-1 text-sm text-[#e4e4ea]">
            Diterima {currency.format(receipt.payment.cashReceived)} · Total {currency.format(receipt.total)}
          </p>
        </div>
      ) : null}

      {/* Print status */}
      {printStatus === "printing" && (
        <div className="flex items-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
          <RefreshCw className="size-4 animate-spin text-[#f5a742]" />
          <span className="text-sm text-[#ffd79a]">Mencetak struk...</span>
        </div>
      )}

      {printStatus === "success" && (
        <div className="flex items-center gap-2 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/12 p-3">
          <Check className="size-4 text-[#4ade80]" />
          <span className="text-sm text-[#dcfce7]">Struk berhasil dicetak. Ambil kertasnya.</span>
        </div>
      )}

      {printStatus === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 p-3">
          <Printer className="mt-0.5 size-4 shrink-0 text-[#f5a742]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#ffd79a]">
              Pembayaran sukses — hanya cetak struk yang gagal.
            </p>
            <p className="mt-0.5 text-xs text-[#e6c58f]">{printError}</p>
          </div>
          <button onClick={handlePrint} className="shrink-0 text-xs text-[#f5a742] underline">Coba lagi</button>
        </div>
      )}

      <ReceiptPreviewCard receipt={receipt} />

      {/* === KIRIM INVOICE BLOCK === */}
      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-[#25d366]" />
            <p className="garage-mono text-[12px] uppercase tracking-wide text-[#d6d6dc]">
              Kirim Invoice ke Customer
            </p>
          </div>
          {waSentTo && !waEditing && (
            <span className="garage-mono text-[10px] uppercase tracking-wide text-[#4ade80]">
              ✓ Terkirim
            </span>
          )}
        </div>

        {/* Phone row: display mode vs edit mode */}
        {!waEditing && waPhone ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-black/30 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">Nomor tujuan</p>
              <p className="garage-mono truncate text-sm font-semibold text-white">
                {formatWaDisplay(waPhone)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWaEditing(true)}
              className="shrink-0 text-xs text-[#f5a742] underline hover:text-[#ffba5a]"
            >
              Ganti
            </button>
          </div>
        ) : (
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
              No. WhatsApp customer
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
          </div>
        )}

        {/* Action buttons: WA send + Copy link + Open invoice */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="garage-press h-11 gap-2 bg-[#25d366] text-black hover:bg-[#34e377]"
            onClick={handleSendWhatsapp}
          >
            <MessageCircle className="size-4" />
            Kirim WhatsApp
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 gap-2 border-[#4a4a54]"
            onClick={handleCopyLink}
            disabled={!hasInvoiceLink}
          >
            {copyState === "copied" ? (
              <>
                <Check className="size-4 text-[#4ade80]" />
                Link Tersalin
              </>
            ) : copyState === "error" ? (
              <>
                <X className="size-4 text-[#ffc2c8]" />
                Gagal Salin
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Salin Link Invoice
              </>
            )}
          </Button>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {hasInvoiceLink && (
            <button
              type="button"
              onClick={handleOpenInvoice}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
            >
              <ExternalLink className="size-3.5" />
              Buka halaman invoice
            </button>
          )}
          {invoicePdfUrl && (
            <a
              href={invoicePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#34343c] py-2 text-xs text-[#8f8f99] transition-colors hover:border-[#4a4a54] hover:text-[#d6d6dc]"
            >
              <Download className="size-3.5" />
              Unduh invoice PDF
            </a>
          )}
        </div>
      </div>
      {/* === END KIRIM INVOICE BLOCK === */}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button className="garage-press h-12 gap-2" onClick={handlePrint} disabled={printStatus === "printing"}>
          <Printer className="size-4" />
          {printStatus === "idle" && "Cetak Struk"}
          {printStatus === "printing" && "Mencetak..."}
          {printStatus === "success" && "Cetak Struk"}
          {printStatus === "error" && "Cetak Struk"}
        </Button>
        <Button variant="outline" className="garage-press h-12 gap-2 border-[#4a4a54]" onClick={onNewTransaction}>
          <RefreshCw className="size-4" />
          Transaksi Baru
        </Button>
        <Button variant="outline" className="garage-press h-12 gap-2 border-[#4a4a54] w-auto px-3" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Normalisasi no HP Indonesia ke format wa.me (62xxxxxxxxxx, tanpa "+" / "-")
function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

// Format tampilan: 6281234567890 → +62 812-3456-7890
function formatWaDisplay(phone: string): string {
  const normalized = normalizeWaNumber(phone);
  if (!normalized.startsWith("62")) return phone;
  const local = normalized.slice(2);
  if (local.length < 4) return `+62 ${local}`;
  const parts = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return `+62 ${parts.join("-")}`;
}


export function ReceiptPreviewCard({ receipt }: { receipt: OrderReceipt }) {
  const serviceLabel = `Service ${receipt.settings?.serviceChargePct ?? 5}%`;
  const taxLabel = `PB1 ${receipt.settings?.taxPct ?? 10}%`;
  const brandName = receipt.settings?.brandName || "GARAGE";
  const brandTagline = receipt.settings?.brandTagline || "Coffee · Tebing Tinggi";
  const footer = receipt.settings?.receiptFooter || "Terima kasih sudah mampir ke GARAGE.";

  return (
    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-4">
      {receipt.isReprint ? (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-md border border-[#f5a742]/55 bg-[#f5a742]/14 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ffd08a]">
          <Printer className="size-3.5" />
          Cetak Ulang · {formatReceiptDate(receipt.reprintAt ?? new Date().toISOString())}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="garage-display garage-chrome text-2xl leading-none">
            {brandName}
          </p>
          <p className="text-xs text-[#b8b8bf]">{brandTagline}</p>
        </div>
        <div className="text-right">
          <p className="garage-mono text-[11px] text-[#b8b8bf]">Struk</p>
          <p className="text-sm font-semibold text-white">{receipt.orderNo}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <BillRow label="Tanggal" value={formatReceiptDate(receipt.createdAt)} />
        <BillRow label="Kasir" value={receipt.cashier.name} />
      </div>
      <div className="mt-4 space-y-2">
        {receipt.items.map((item) => (
          <div
            key={`${item.name}-${item.variant}-${item.qty}`}
            className="rounded-md border border-[#34343c] bg-[#202027]/78 p-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                <p className="text-xs text-[#b8b8bf]">
                  {item.variant} x {item.qty}
                </p>
              </div>
              <p className="garage-mono text-sm text-white">
                {currency.format(item.lineTotal)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-[#4a4a54] bg-[#0f0f14] p-3">
        <BillRow label="Subtotal" value={currency.format(receipt.subtotal)} />
        {receipt.service > 0 ? (
          <BillRow label={serviceLabel} value={currency.format(receipt.service)} />
        ) : null}
        {receipt.tax > 0 ? (
          <BillRow label={taxLabel} value={currency.format(receipt.tax)} />
        ) : null}
        {receipt.discount > 0 ? (
          <BillRow label="Diskon" value={`- ${currency.format(receipt.discount)}`} />
        ) : null}
        <BillRow label="Total" value={currency.format(receipt.total)} large accent />
      </div>
      <div className="mt-4 rounded-md border border-[#34343c] bg-white/[0.04] px-3 py-2 text-center text-xs text-[#d6d6dc]">
        {footer}
      </div>
    </div>
  );
}

export function PrintableReceipt({ receipt }: { receipt: OrderReceipt }) {
  const serviceLabel = `Service ${receipt.settings?.serviceChargePct ?? 5}%`;
  const taxLabel = `PB1 ${receipt.settings?.taxPct ?? 10}%`;
  const brandName = receipt.settings?.brandName || "GARAGE";
  const brandTagline = receipt.settings?.brandTagline || "Coffee · Tebing Tinggi";
  const footer = receipt.settings?.receiptFooter || "Terima kasih";

  return (
    <div className="garage-print-thermal">
      {receipt.isReprint ? (
        <div
          style={{
            border: "2px dashed #000",
            padding: "4px 6px",
            textAlign: "center",
            fontWeight: 900,
            letterSpacing: "0.18em",
            margin: "0 0 6px",
          }}
        >
          *** CETAK ULANG ***
          <br />
          <span style={{ fontWeight: 700, fontSize: "0.85em" }}>
            {formatReceiptDate(receipt.reprintAt ?? new Date().toISOString())}
          </span>
        </div>
      ) : null}
      <div className="garage-print-header">
        <p className="garage-print-brand">{brandName}</p>
        <p>{brandTagline}</p>
        <p>{receipt.outlet.name}</p>
        {receipt.settings?.outletAddress ? <p>{receipt.settings.outletAddress}</p> : null}
        {receipt.settings?.outletPhone ? <p>{receipt.settings.outletPhone}</p> : null}
        {receipt.settings?.npwp ? <p>NPWP {receipt.settings.npwp}</p> : null}
      </div>
      <div className="garage-print-meta">
        <div><span>Invoice</span><strong>{receipt.invoiceNo}</strong></div>
        <div><span>Status</span><strong>{receipt.invoiceStatus}</strong></div>
        <div><span>Order</span><strong>{receipt.orderNo}</strong></div>
        <div>
          <span>KDS</span>
          <strong>{receipt.ticketNos.length > 1 ? receipt.ticketNos.join(", ") : receipt.ticketNo}</strong>
        </div>
        <div><span>Tanggal</span><strong>{formatReceiptDate(receipt.createdAt)}</strong></div>
        <div><span>Kasir</span><strong>{receipt.cashier.name}</strong></div>
      </div>
      <div className="garage-print-lines">
        {receipt.items.map((item) => (
          <div key={`${item.name}-${item.variant}-${item.qty}`} className="garage-print-line">
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.variant} x {item.qty} @ {currency.format(item.unitPrice)}
              </span>
            </div>
            <strong>{currency.format(item.lineTotal)}</strong>
          </div>
        ))}
      </div>
      <div className="garage-print-totals">
        <ReceiptPrintRow label="Subtotal" value={receipt.subtotal} />
        {receipt.service > 0 ? <ReceiptPrintRow label={serviceLabel} value={receipt.service} /> : null}
        {receipt.tax > 0 ? (
          <ReceiptPrintRow label={taxLabel} value={receipt.tax} />
        ) : null}
        {receipt.discount > 0 ? (
          <ReceiptPrintRow label="Diskon" value={-receipt.discount} />
        ) : null}
        <ReceiptPrintRow label="Total" value={receipt.total} strong />
        {receipt.payment.cashReceived !== null && (
          <>
            <ReceiptPrintRow label="Diterima" value={receipt.payment.cashReceived} />
            <ReceiptPrintRow label="Kembalian" value={receipt.payment.change ?? 0} />
          </>
        )}
      </div>
      <div className="garage-print-footer">
        <p>{footer}</p>
      </div>
    </div>
  );
}

export function ReceiptPrintRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "garage-print-total-row strong" : "garage-print-total-row"}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}
