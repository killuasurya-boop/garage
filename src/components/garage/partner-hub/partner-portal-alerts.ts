"use client";

// Kenyamanan mitra di HP: bunyi + getar saat pesanan baru masuk, dan layar tetap menyala selama jualan.
// Browser HP hanya mengizinkan suara setelah mitra menekan tombol sekali, jadi bunyi dinyalakan lewat tombol.

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "garage:partner-portal-sound";
const AWAKE_KEY = "garage:partner-portal-awake";

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Mode privat: pilihan hanya berlaku selama halaman terbuka.
  }
}

type WakeLockSentinelLike = { release: () => Promise<void> };

export function usePartnerAlerts(queueTicketNos: string[] | null) {
  const [soundOn, setSoundOn] = useState(() => (typeof window === "undefined" ? false : readFlag(SOUND_KEY)));
  const [awakeOn, setAwakeOn] = useState(() => (typeof window === "undefined" ? false : readFlag(AWAKE_KEY)));
  const [awakeSupported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);
  const audioRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<string> | null>(null);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    void ctx.resume();
    // Dua nada pendek — cukup terdengar di dapur, tidak mengagetkan pelanggan.
    [0, 0.22].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = index === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    if (next && !audioRef.current && typeof window !== "undefined") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    setSoundOn(next);
    writeFlag(SOUND_KEY, next);
    if (next) beep();
  }, [soundOn, beep]);

  // Pesanan baru (status "Pesanan baru" yang belum pernah terlihat) → bunyi + getar. Muatan pertama tidak berbunyi.
  useEffect(() => {
    if (!queueTicketNos) return;
    const seen = seenRef.current;
    seenRef.current = new Set(queueTicketNos);
    if (!seen) return;
    const fresh = queueTicketNos.filter((no) => !seen.has(no)).length;
    if (!fresh) return;
    if (soundOn) beep();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Getar tidak didukung (iPhone): cukup bunyi & tampilan.
    }
  }, [queueTicketNos, soundOn, beep]);

  // Judul tab menampilkan jumlah pesanan baru (terlihat walau mitra membuka aplikasi lain).
  useEffect(() => {
    const waiting = queueTicketNos?.length ?? 0;
    document.title = waiting ? `(${waiting}) Pesanan baru · Portal Mitra` : "Portal Mitra · Garage Coffee";
  }, [queueTicketNos]);

  // Layar tetap menyala: dilepas browser saat tab disembunyikan, diminta ulang saat kembali.
  useEffect(() => {
    if (!awakeOn || !awakeSupported) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await (navigator as unknown as { wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // Baterai hemat / izin ditolak: layar mengikuti setelan HP.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [awakeOn, awakeSupported]);

  const toggleAwake = useCallback(() => {
    setAwakeOn((on) => {
      writeFlag(AWAKE_KEY, !on);
      return !on;
    });
  }, []);

  return { soundOn, toggleSound, awakeOn, awakeSupported, toggleAwake };
}
