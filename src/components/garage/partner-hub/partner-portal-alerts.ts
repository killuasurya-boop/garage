"use client";

// Kenyamanan mitra di HP: bunyi + getar saat pesanan baru masuk, dan layar tetap menyala selama jualan.
// Browser HP hanya mengizinkan suara setelah mitra menekan tombol sekali, jadi bunyi dinyalakan lewat tombol.

import { useCallback, useEffect, useRef, useState } from "react";

import { createPushSubscription, pushSupport, type PushSupport } from "@/lib/push-client";

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
  // Bunyi baru "nyala" setelah AudioContext benar-benar dibuat lewat sentuhan mitra. Pilihan yang tersimpan hanya
  // berarti "aktifkan otomatis pada sentuhan pertama" — tombol tidak pernah mengaku nyala padahal belum bisa bunyi.
  const [soundOn, setSoundOn] = useState(false);
  const [soundWanted] = useState(() => (typeof window === "undefined" ? false : readFlag(SOUND_KEY)));
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

  const ensureAudio = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    void audioRef.current?.resume();
    return Boolean(audioRef.current);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    const ready = next ? ensureAudio() : false;
    setSoundOn(ready);
    writeFlag(SOUND_KEY, next);
    if (ready) beep();
  }, [soundOn, beep, ensureAudio]);

  // Setelah muat ulang: bunyi yang pernah dinyalakan aktif lagi pada sentuhan pertama di mana saja (aturan browser HP).
  useEffect(() => {
    if (!soundWanted || soundOn) return;
    const arm = () => {
      if (ensureAudio()) setSoundOn(true);
    };
    document.addEventListener("pointerdown", arm, { once: true });
    return () => document.removeEventListener("pointerdown", arm);
  }, [soundWanted, soundOn, ensureAudio]);

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

  // Push ke HP terkunci (Web Push). iPhone: hanya setelah portal "Tambahkan ke Layar Utama".
  const [pushState, setPushState] = useState<PushSupport | "on" | "off" | "denied">("off");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = pushSupport();
      let next: PushSupport | "on" | "off" | "denied" = support === "supported" ? "off" : support;
      if (support === "supported") {
        if (Notification.permission === "denied") next = "denied";
        else {
          const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
          const current = await registration?.pushManager?.getSubscription().catch(() => null);
          if (current && Notification.permission === "granted") next = "on";
        }
      }
      if (!cancelled) setPushState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enablePush = useCallback(async () => {
    try {
      const subscription = await createPushSubscription();
      if (!subscription?.endpoint || !subscription.keys) {
        setPushState(typeof Notification !== "undefined" && Notification.permission === "denied" ? "denied" : "off");
        return false;
      }
      const res = await fetch("/api/partner/push", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
      });
      setPushState(res.ok ? "on" : "off");
      return res.ok;
    } catch {
      setPushState("off");
      return false;
    }
  }, []);

  /** Dipanggil sebelum logout: HP ini berhenti menerima push mitra. Tidak pernah melempar. */
  const releasePush = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager?.getSubscription();
      if (!subscription) return;
      await fetch("/api/partner/push", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    } catch {
      // abaikan: logout tetap jalan
    }
  }, []);

  const toggleAwake = useCallback(() => {
    setAwakeOn((on) => {
      writeFlag(AWAKE_KEY, !on);
      return !on;
    });
  }, []);

  return { soundOn, soundPending: soundWanted && !soundOn, toggleSound, awakeOn, awakeSupported, toggleAwake, pushState, enablePush, releasePush };
}
