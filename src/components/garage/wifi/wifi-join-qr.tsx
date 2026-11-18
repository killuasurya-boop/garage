"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR "gabung WiFi" (Owner 17 Nov 2026): kamera iPhone/Android langsung menawarkan "Sambungkan".
// Isi QR hanya nama WiFi (jaringan tamu terbuka); password harian ada di login hotspot, tidak pernah di QR.
export function WifiJoinQr({ payload, ssid, size = 220 }: { payload: string; ssid: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#0b0b0c", light: "#ffffff" } })
      .then((data) => !cancelled && setSrc(data))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [payload, size]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL QR, bukan aset
    <img src={src} alt={`QR sambung WiFi ${ssid}`} width={size} height={size} className="rounded-lg bg-white p-2" data-testid="wifi-join-qr" />
  ) : (
    <div style={{ width: size, height: size }} className="grid place-items-center rounded-lg border border-white/15 text-sm text-zinc-300">
      Memuat QR…
    </div>
  );
}
