"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Upload } from "lucide-react";

import type { CustomerOrder } from "@/lib/garage-api-types";
import { buildGarageOrderNotice, waLink } from "@/lib/whatsapp-link";

// Setelah checkout QRIS/Transfer: unggah bukti bayar lalu kirim ringkasan
// pesanan ke WhatsApp Garage (link wa.me, gratis). Berlaku untuk dine-in,
// take away, dan delivery.
export function PaymentProofPanel({
  token,
  order,
  invoiceUrl,
  garageWhatsapp,
  alreadyPaid,
}: {
  token: string;
  order: CustomerOrder;
  invoiceUrl: string | null;
  garageWhatsapp: string;
  alreadyPaid: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(Boolean(order.paymentProofUrl));
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("token", token);
      body.set("file", file);
      const res = await fetch("/api/customer/orders/payment-proof", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Bukti gagal diunggah. Coba lagi.");
      setUploaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bukti gagal diunggah. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  const waUrl = waLink(
    garageWhatsapp,
    buildGarageOrderNotice(
      {
        orderNo: order.orderNo,
        tableLabel: order.tableLabel,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        fulfillment: order.fulfillment ?? null,
        total: order.total,
        items: order.items,
        invoiceUrl,
        paymentMethod: [order.paymentMethod, order.paymentProvider].filter(Boolean).join(" · ") || null,
      },
      uploaded,
    ),
  );

  if (alreadyPaid) return null;
  return (
    <div className="mt-4 rounded-lg border border-garage-amber/45 bg-garage-amber/[0.07] p-3" data-testid="payment-proof-panel">
      <p className="text-sm font-bold text-white">Sudah transfer / scan QRIS?</p>
      <p className="mt-0.5 text-sm text-garage-dim">
        Unggah bukti bayar supaya kasir cepat mengonfirmasi, lalu kabari Garage lewat WhatsApp.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="garage-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-garage-line-2 bg-garage-bg-2 px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : uploaded ? (
            <CheckCircle2 size={16} className="text-[#86efac]" />
          ) : (
            <Upload size={16} />
          )}
          {uploaded ? "Bukti terunggah · Ganti" : "Unggah bukti bayar"}
        </button>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="garage-wa-notice"
            className="garage-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#25d366] px-4 text-sm font-bold text-black"
          >
            <MessageCircle size={16} />
            Kirim ke WA Garage
          </a>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#ffb3b3]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
