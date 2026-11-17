"use client";

import { useEffect, useState } from "react";
import { Wifi, X } from "lucide-react";

import { WifiJoinQr } from "@/components/garage/wifi/wifi-join-qr";

type WifiConfig = { enabled: boolean; ssid: string; sessionHours: number; joinQr?: string };

// Tombol "Sambung WiFi" di menu digital: tampil hanya bila WiFi member aktif & terkonfigurasi.
export function WifiJoinButton() {
  const [config, setConfig] = useState<WifiConfig | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/wifi/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => alive && json?.data && setConfig(json.data as WifiConfig))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!config?.enabled || !config.joinQr) return null;
  return (
    <>
      <button type="button" className="gm5-icon-btn" aria-label="Sambung WiFi" onClick={() => setOpen(true)}>
        <Wifi className="size-[22px]" aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Sambung WiFi Garage" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-white/15 bg-[#17181c] p-5 text-center text-zinc-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 text-left">
              <div>
                <h2 className="text-lg font-bold">Sambung WiFi</h2>
                <p className="text-sm text-zinc-300">{config.ssid}</p>
              </div>
              <button type="button" className="gm5-icon-btn" aria-label="Tutup" onClick={() => setOpen(false)}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex justify-center">
              <WifiJoinQr payload={config.joinQr} ssid={config.ssid} />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-left text-sm text-zinc-300">
              <li>Scan QR ini dengan kamera HP lain, atau pilih WiFi “{config.ssid}” di pengaturan HP.</li>
              <li>Halaman login Garage terbuka otomatis — masuk / daftar member.</li>
              <li>Internet aktif {config.sessionHours} jam. Tanpa ketik password.</li>
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
