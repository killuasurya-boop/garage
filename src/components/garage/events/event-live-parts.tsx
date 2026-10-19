"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Share2 } from "lucide-react";

import { countdownParts, eventPhase } from "@/lib/event-format";

// Jam detik bersama: snapshot berubah tiap detik; di server null (placeholder)
// supaya tidak ada hydration mismatch.
function subscribeSecond(callback: () => void) {
  const timer = window.setInterval(callback, 1000);
  return () => window.clearInterval(timer);
}
const currentSecond = () => Math.floor(Date.now() / 1000) * 1000;
const serverSecond = () => null;

// Countdown ke acara (zona sudah tertanam di ISO); tanpa animasi (aman untuk reduced motion).
export function EventCountdown({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useSyncExternalStore(subscribeSecond, currentSecond, serverSecond);

  if (now === null) return <div className="h-[76px]" aria-hidden />;

  const phase = eventPhase({ startsAt, endsAt }, now);
  if (phase !== "upcoming") {
    return (
      <p data-testid="event-phase" className="rounded-md border border-garage-amber/60 bg-garage-amber/10 px-4 py-3 text-base font-bold text-garage-amber">
        {phase === "live" ? "Acara sedang berlangsung — sampai jumpa di Garage!" : "Terima kasih sudah merayakan Grand Opening bersama kami."}
      </p>
    );
  }

  const parts = countdownParts(startsAt, now);
  const cells = [
    { label: "Hari", value: parts.days },
    { label: "Jam", value: parts.hours },
    { label: "Menit", value: parts.minutes },
    { label: "Detik", value: parts.seconds },
  ];
  return (
    <div role="timer" aria-label="Hitung mundur menuju acara" className="grid max-w-md grid-cols-4 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-garage-line-2 bg-garage-bg-2/90 px-2 py-2 text-center">
          <div className="text-2xl font-black tabular-nums text-garage-fg sm:text-3xl">{String(cell.value).padStart(2, "0")}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-garage-dim">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}

export function EventShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // dibatalkan pengguna — abaikan
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      data-testid="event-share"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-garage-line-2 px-5 text-sm font-bold uppercase tracking-wide text-garage-fg transition hover:border-garage-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber"
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Share2 aria-hidden className="size-4" />}
      {copied ? "Link disalin" : "Bagikan"}
    </button>
  );
}

// Countdown gaya poster (angka besar krem, garis merah) untuk landing Grand Opening.
export function PosterCountdown({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useSyncExternalStore(subscribeSecond, currentSecond, serverSecond);
  const reference = now ?? Date.parse(startsAt);
  const phase = eventPhase({ startsAt, endsAt }, reference);
  const parts = countdownParts(startsAt, reference);
  const cells = [
    { label: "Hari", value: parts.days },
    { label: "Jam", value: parts.hours },
    { label: "Menit", value: parts.minutes },
    { label: "Detik", value: parts.seconds },
  ];
  return (
    <div className="flex w-full flex-col items-center gap-7">
      <div className="flex items-center gap-3">
        <span className="gp-dot size-2.5 rounded-full bg-[#7cff3a] shadow-[0_0_14px_#7cff3a]" aria-hidden />
        <span className="gp-label" data-testid="event-phase">
          {now === null ? "Menuju Grand Opening" : phase === "upcoming" ? "Menuju Grand Opening" : phase === "live" ? "Sedang berlangsung" : "Terima kasih telah hadir"}
        </span>
      </div>
      {phase === "upcoming" || now === null ? (
        <div className="gp-count w-full max-w-[900px]" role="timer" aria-label="Hitung mundur menuju Grand Opening">
          {cells.map((cell) => (
            <div key={cell.label} className="border-l-2 border-[#e0262f] px-3 py-1.5">
              <div className="gp-display gp-count-num text-[104px] leading-none tabular-nums text-[#efe6d6]">
                {now === null ? "--" : String(cell.value).padStart(2, "0")}
              </div>
              <div className="gp-label mt-2.5">{cell.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3" data-testid="event-phase-message">
          <p className="gp-display gp-h2 text-[88px] leading-none text-[#efe6d6]">
            {phase === "live" ? "Kami sedang berpesta" : "Terima kasih"}
          </p>
          <p className="max-w-[560px] text-[17px] leading-relaxed text-[#d8d1c3]">
            {phase === "live"
              ? "Grand Opening sedang berlangsung. Langsung datang ke Garage Coffee — cek rundown di bawah."
              : "Grand Opening Garage Coffee sudah selesai. Terima kasih sudah merayakan bersama — sampai jumpa lagi di Garage."}
          </p>
        </div>
      )}
    </div>
  );
}

const AGE_KEY = "garage-age-21";
const AGE_EVENT = "garage-age-21-change";
function subscribeAge(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(AGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(AGE_EVENT, callback);
  };
}
function readAge() {
  try {
    return window.localStorage.getItem(AGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Gerbang usia 21+ (konten sponsor produk tembakau). Dirender juga di server
// (belum terkonfirmasi) supaya tidak ada kilasan konten sebelum konfirmasi.
export function AgeGate({ exitHref = "/" }: { exitHref?: string }) {
  const confirmed = useSyncExternalStore(subscribeAge, readAge, () => false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Selama gerbang tampil: halaman di belakang tidak bisa di-scroll atau difokus (Tab).
  useEffect(() => {
    const overlay = overlayRef.current;
    if (confirmed || !overlay?.parentElement) return;
    const siblings = Array.from(overlay.parentElement.children).filter(
      (el): el is HTMLElement => el !== overlay && el instanceof HTMLElement && !el.inert,
    );
    siblings.forEach((el) => (el.inert = true));
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      siblings.forEach((el) => (el.inert = false));
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [confirmed]);

  if (confirmed) return null;

  function confirm() {
    try {
      window.localStorage.setItem(AGE_KEY, "1");
    } catch {
      // penyimpanan diblokir — tetap tutup untuk sesi ini
    }
    window.dispatchEvent(new Event(AGE_EVENT));
  }

  return (
    <div ref={overlayRef} className="gp-age-overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,10,11,0.92)] p-4 backdrop-blur-sm">
      {/* Tanpa JavaScript tombol tidak berfungsi — gerbang disembunyikan agar info acara tetap terbaca. */}
      <noscript>
        <style>{".gp-age-overlay{display:none!important}"}</style>
      </noscript>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        data-testid="age-gate"
        className="w-full max-w-[520px] border border-[rgba(239,230,214,0.15)] border-t-4 border-t-[#e0262f] bg-[#121214] px-6 py-10 text-center sm:px-11"
      >
        <h2 id="age-gate-title" className="gp-display text-[40px] leading-none text-[#efe6d6]">
          Usia 21 tahun ke atas
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[#d8d1c3]">
          Halaman acara ini memuat informasi sponsor yang hanya untuk pengunjung berusia 21 tahun ke atas. Apakah usia Anda sudah 21 tahun?
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={confirm} data-testid="age-gate-yes" className="gp-btn gp-btn-red flex-1" autoFocus>
            Ya, 21+
          </button>
          <a href={exitHref} className="gp-btn gp-btn-line flex-1">
            Belum
          </a>
        </div>
      </section>
    </div>
  );
}
