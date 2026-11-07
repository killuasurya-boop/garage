"use client";

import { useState } from "react";
import { Check, Download, Maximize2, QrCode } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { QRIS_IMAGE_SRC, QRIS_MERCHANT } from "@/lib/garage-qris";
import { WhatsAppPaymentProofHelp, type WhatsAppInvoiceData } from "./whatsapp-order-share";

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

/**
 * QRIS statis resmi (BNI, garage-qris.ts). Gambar selalu `object-contain` di atas
 * pelat putih — tidak pernah diregangkan/dipotong agar tetap bisa dipindai.
 * "Saya Sudah Bayar" hanya membuka bantuan bukti bayar; status tidak berubah di sini.
 */
export function InvoiceQrisCard({ data }: { data: WhatsAppInvoiceData }) {
  const [zoom, setZoom] = useState(false);
  const [proof, setProof] = useState(false);

  return (
    <section className="iv-card iv-card-pad iv-reveal iv-no-print" aria-labelledby="iv-qris-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--iv-red-soft)] text-[var(--iv-red)]">
          <QrCode className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="iv-qris-title" className="iv-card-title">Bayar via QRIS</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-[var(--iv-text-2)]">
            Scan QRIS lalu masukkan nominal <strong className="text-[var(--iv-cream)]">{rupiah(data.total)}</strong> sesuai total tagihan.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setZoom(true)}
        className="mx-auto mt-4 block w-full max-w-[260px] rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgb(217_37_50/0.35),0_12px_30px_rgb(0_0_0/0.45)] transition-transform active:scale-[0.99]"
        aria-label="Perbesar QRIS"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- QRIS resmi, tidak boleh dioptimasi/diubah */}
        <img src={QRIS_IMAGE_SRC} alt={`QRIS ${QRIS_MERCHANT.name}, NMID ${QRIS_MERCHANT.nmid}`} className="block h-auto w-full object-contain" />
      </button>
      <p className="mt-2 text-center text-[12px] text-[var(--iv-text-3)]">
        {QRIS_MERCHANT.name} · NMID {QRIS_MERCHANT.nmid}
      </p>

      <div className="mt-4 grid gap-2">
        <button type="button" className="iv-btn iv-btn-primary iv-btn-block" onClick={() => setProof(true)}>
          <Check className="size-4" aria-hidden />
          Saya Sudah Bayar
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="iv-btn iv-btn-secondary iv-btn-sm" onClick={() => setZoom(true)}>
            <Maximize2 className="size-4" aria-hidden />
            Perbesar QR
          </button>
          <a className="iv-btn iv-btn-secondary iv-btn-sm" href={QRIS_IMAGE_SRC} download="QRIS-Garage-Coffee.png">
            <Download className="size-4" aria-hidden />
            Simpan QR
          </a>
        </div>
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[min(92vw,440px)] border-0 bg-white p-4 text-[#111]">
          <DialogTitle className="text-center text-base font-bold text-[#111]">Bayar {rupiah(data.total)}</DialogTitle>
          <DialogDescription className="text-center text-xs text-[#4b5563]">
            Order {data.orderNo} · Scan dengan aplikasi bank / e-wallet apa pun.
          </DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element -- QRIS resmi */}
          <img src={QRIS_IMAGE_SRC} alt={`QRIS ${QRIS_MERCHANT.name}`} className="mx-auto block h-auto w-full object-contain" />
        </DialogContent>
      </Dialog>

      <WhatsAppPaymentProofHelp data={data} open={proof} onOpenChange={setProof} />
    </section>
  );
}
