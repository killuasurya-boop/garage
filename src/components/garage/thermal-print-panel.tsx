"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";

import type { OrderReceipt } from "@/lib/garage-api-types";

interface ThermalPrintProps {
  receipt: OrderReceipt;
  onClose: () => void;
  onPrintAgain?: () => void;
}

type PrintErrorState = {
  title: string;
  hint: string;
  actions: string[];
  detail: string;
};

export function ThermalPrintPanel({ receipt, onClose, onPrintAgain }: ThermalPrintProps) {
  const [status, setStatus] = useState<"idle" | "printing" | "success" | "error">("idle");
  const [error, setError] = useState<PrintErrorState | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  async function handlePrint() {
    setStatus("printing");
    setError(null);
    setShowDetail(false);

    try {
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: {
          message?: string;
          title?: string;
          hint?: string;
          actions?: string[];
          detail?: string;
        };
        message?: string;
      };

      if (!res.ok) {
        setStatus("error");
        const err = data.error;
        setError({
          title: err?.title || err?.message || "Gagal mencetak",
          hint:
            err?.hint ||
            "Terjadi error saat mengirim data ke printer. Coba beberapa saat lagi.",
          actions: err?.actions?.length
            ? err.actions
            : [
                "Pastikan printer menyala dan terhubung",
                "Cek apakah kertas masih ada",
                "Coba cetak lagi",
              ],
          detail: err?.detail || data.message || "",
        });
        return;
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError({
        title: "Tidak bisa terhubung ke server",
        hint: "Aplikasi POS tidak bisa kirim perintah cetak ke backend.",
        actions: [
          "Pastikan server aplikasi Garage masih berjalan",
          "Cek koneksi jaringan komputer kasir",
          "Refresh halaman lalu coba cetak lagi",
        ],
        detail: err instanceof Error ? err.message : "Koneksi gagal",
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-[#f5a742]/15">
          <Printer className="size-5 text-[#f5a742]" />
        </div>
        <div>
          <p className="font-semibold text-white">Cetak Struk Thermal</p>
          <p className="font-mono text-xs text-[#8f8f99]">{receipt.invoiceNo}</p>
        </div>
      </div>

      {/* Print button */}
      {status === "idle" && (
        <button
          type="button"
          onClick={handlePrint}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#f5a742] text-sm font-bold text-black transition-transform active:scale-95"
        >
          <Printer className="size-4" />
          Cetak Sekarang
        </button>
      )}

      {/* Printing */}
      {status === "printing" && (
        <div className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 text-sm text-[#ffd79a]">
          <RefreshCw className="size-4 animate-spin" />
          Mencetak ke printer...
        </div>
      )}

      {/* Success */}
      {status === "success" && (
        <div className="flex flex-col gap-3 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/12 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-[#22c55e]" />
            <p className="font-semibold text-white">Struk berhasil dicetak!</p>
          </div>
          <p className="text-xs text-[#8f8f99]">
            Struk sudah keluar dari printer. Ambil kertasnya dan berikan ke customer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrintAgain || handlePrint}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-[#34343c] text-xs text-[#b8b8bf] transition-colors hover:border-[#4a4a54] hover:text-white"
            >
              <Printer className="size-3" />
              Cetak Lagi
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-[#34343c] text-xs text-[#b8b8bf] transition-colors hover:border-[#4a4a54] hover:text-white"
            >
              <X className="size-3" />
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && error && (
        <div className="flex flex-col gap-3 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d11a2a]/20">
              <AlertTriangle className="size-5 text-[#ffc2c8]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{error.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#d6d6dc]">
                {error.hint}
              </p>
            </div>
          </div>

          {/* Checklist langkah perbaikan */}
          {error.actions.length > 0 && (
            <div className="rounded-md border border-[#34343c] bg-black/30 p-3">
              <p className="garage-mono mb-2 text-[11px] uppercase tracking-wide text-[#f5a742]">
                Coba langkah berikut
              </p>
              <ol className="space-y-1.5">
                {error.actions.map((action, idx) => (
                  <li
                    key={idx}
                    className="flex gap-2 text-xs leading-relaxed text-[#d6d6dc]"
                  >
                    <span className="garage-mono shrink-0 text-[#f5a742]">
                      {idx + 1}.
                    </span>
                    <span className="min-w-0">{action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Detail teknis — collapsible, default tertutup */}
          {error.detail && (
            <div className="rounded-md border border-[#34343c] bg-black/20">
              <button
                type="button"
                onClick={() => setShowDetail((value) => !value)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-[#8f8f99] transition-colors hover:text-[#d6d6dc]"
              >
                <span>Detail teknis (untuk IT)</span>
                {showDetail ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
              {showDetail && (
                <pre className="garage-scroll max-h-32 overflow-auto border-t border-[#34343c] px-3 py-2 font-mono text-[10px] leading-snug text-[#8f8f99]">
                  {error.detail}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#f5a742] text-sm font-semibold text-black transition-transform active:scale-95"
            >
              <RefreshCw className="size-4" />
              Coba Lagi
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-[#4a4a54] text-sm text-[#d6d6dc] transition-colors hover:border-[#8f8f99] hover:text-white"
            >
              <X className="size-4" />
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-[#8f8f99]">
        Pastikan printer RPP02N dalam kondisi hidup dan kertas sudah terpasang.
        Koneksi via USB.
      </p>
    </div>
  );
}
