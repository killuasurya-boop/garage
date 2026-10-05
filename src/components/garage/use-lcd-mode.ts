"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Mode Layar LCD untuk papan Production Bar/Dapur: layar penuh (sidebar & bar
// browser hilang), teks diperbesar untuk dibaca dari jarak 1–3 m, dan layar
// dijaga tetap menyala (Wake Lock) selama mode aktif.

const STORAGE_KEY = "garage:production-lcd-zoom";
export const LCD_ZOOM_OPTIONS = [1, 1.25, 1.5] as const;
export type LcdZoom = (typeof LCD_ZOOM_OPTIONS)[number];

type WakeLockSentinelLike = { release: () => Promise<void> };

function loadZoom(): LcdZoom {
  if (typeof window === "undefined") return 1.25;
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return (LCD_ZOOM_OPTIONS as readonly number[]).includes(raw) ? (raw as LcdZoom) : 1.25;
  } catch {
    return 1.25;
  }
}

export function useLcdMode() {
  const [active, setActive] = useState(false);
  // Zoom hanya dipakai saat mode aktif (setelah ketukan), jadi aman dibaca
  // langsung dari localStorage tanpa beda render server/klien yang terlihat.
  const [zoom, setZoomState] = useState<LcdZoom>(loadZoom);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      // Wake Lock ditolak (baterai hemat / browser lama) — layar tetap jalan.
    }
  }, []);

  // Keluar layar penuh lewat tombol Esc/gestur → mode LCD ikut mati.
  useEffect(() => {
    function onChange() {
      if (!document.fullscreenElement) {
        setActive(false);
        releaseWakeLock();
      }
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [releaseWakeLock]);

  // Wake Lock hilang saat tab tersembunyi; minta ulang saat kembali tampil.
  useEffect(() => {
    if (!active) return;
    function onVisible() {
      if (document.visibilityState === "visible") void requestWakeLock();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, requestWakeLock]);

  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  const enter = useCallback(async () => {
    setActive(true);
    void requestWakeLock();
    try {
      // Layar penuh pada <html> (bukan section): dialog Radix dirender ke
      // document.body — kalau section yang fullscreen, dialog QC tidak terlihat
      // dan layar tampak macet. Section menutup layar lewat overlay `fixed`.
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Layar penuh ditolak (iOS Safari) — tetap tampil besar di dalam halaman.
    }
  }, [requestWakeLock]);

  const exit = useCallback(async () => {
    setActive(false);
    releaseWakeLock();
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
  }, [releaseWakeLock]);

  const setZoom = useCallback((value: LcdZoom) => {
    setZoomState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* abaikan */
    }
  }, []);

  return { active, zoom, enter, exit, setZoom };
}
