"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR tiket masuk (GIGS EO Fase 3): isi = tautan undangan pribadi; panitia memindai di pintu (/event-day).
// Dibuat di perangkat tamu, tidak dikirim ke layanan luar.
export function EntryQr({ url, guestName, maxPax }: { url: string; guestName: string; maxPax: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#0b0b0c", light: "#ffffff" } })
      .then((data) => !cancelled && setSrc(data))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="entry-qr">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL QR, bukan aset
        <img src={src} alt={`QR tiket masuk untuk ${guestName}`} width={240} height={240} className="rounded-lg bg-white p-2" />
      ) : (
        <div className="grid size-[240px] place-items-center rounded-lg border border-white/15 text-sm text-zinc-400">Memuat QR…</div>
      )}
      <p className="text-sm text-zinc-300">
        Tunjukkan QR ini ke panitia di pintu masuk · untuk {maxPax} orang
      </p>
    </div>
  );
}
