"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";

interface InvoiceQrProps {
  url: string;
  size?: number;
}

/**
 * QR tautan invoice/tracking. Dibuat sebagai data URL (PNG) sehingga tampil
 * di layar & ikut tercetak — sebelumnya canvas belum terpasang saat QR digambar
 * sehingga QR tidak pernah muncul.
 */
export function InvoiceQrCode({ url, size = 144 }: InvoiceQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fullUrl = url.startsWith("http") || typeof window === "undefined" ? url : `${window.location.origin}${url}`;

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(fullUrl, {
          width: size * 2,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#111827", light: "#ffffff" },
        }),
      )
      .then((value) => {
        if (!cancelled) setDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fullUrl, size]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-md border border-[#34343c] bg-white p-2">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL QR, perlu ikut tercetak
          <img src={dataUrl} width={size} height={size} alt={`QR invoice: ${fullUrl}`} className="block" />
        ) : (
          <div className="flex items-center justify-center" style={{ width: size, height: size }}>
            <QrCode className="text-gray-800" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
          </div>
        )}
      </div>
      <span className="font-mono text-[10px] text-[#a1a1aa]">{failed ? "QR gagal dibuat — buka tautan invoice" : "Scan untuk tracking"}</span>
    </div>
  );
}
