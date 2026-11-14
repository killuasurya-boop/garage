"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Check, Mic2, Music, Share2 } from "lucide-react";

import { agendaClock, agendaLiveState, countdownParts, eventPhase, type EventAgendaItem } from "@/lib/event-format";

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
              <div className="gp-display gp-count-num flex text-[104px] leading-none tabular-nums text-[#efe6d6]" aria-label={`${cell.value} ${cell.label}`}>
                {(now === null ? "--" : String(cell.value).padStart(2, "0")).split("").map((ch, index) => (
                  // key berganti saat digit berubah → animasi flip per digit.
                  <span key={`${index}-${ch}`} className="gp-flip" aria-hidden>
                    {ch}
                  </span>
                ))}
              </div>
              <div className="gp-label mt-2.5">{cell.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3" data-testid="event-phase-message">
          <p className="gp-display gp-h2 relative text-[88px] leading-none text-[#efe6d6]">
            {phase === "ended" ? <Confetti /> : null}
            {phase === "live" ? (
              <>
                <span className="gp-live-badge mr-4 align-middle" aria-hidden>
                  <span className="gp-eq"><i /><i /><i /></span> LIVE
                </span>
                Kami sedang berpesta
              </>
            ) : (
              "Terima kasih"
            )}
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
      (el): el is HTMLElement => el !== overlay && el instanceof HTMLElement && !el.inert && !el.hasAttribute("data-age-keep"),
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

/** Confetti CSS ringan (sekali jalan) untuk judul "Terima kasih". */
export function Confetti() {
  return (
    <span className="gp-confetti" aria-hidden>
      {Array.from({ length: 20 }, (_, index) => (
        <i key={index} style={{ "--i": index } as CSSProperties} />
      ))}
    </span>
  );
}

const SLOT_TAG = { done: "Selesai", live: "", next: "Berikutnya", upcoming: "" } as const;

/**
 * Rundown hidup (mode hari H): sesi berjalan diberi badge LIVE + equalizer,
 * sesi lewat "Selesai", sesi berikut "Berikutnya"; garis waktu terisi sesuai jam.
 * Di server/pra-hidrasi semua sesi tampil netral (tanpa status) → tanpa mismatch.
 */
export function AgendaLive({
  agenda,
  startsAt,
  endsAt,
  timezone,
  zone,
}: {
  agenda: EventAgendaItem[];
  startsAt: string;
  endsAt: string;
  timezone: string;
  zone: string;
}) {
  const now = useSyncExternalStore(subscribeSecond, currentSecond, serverSecond);
  const live = now === null ? null : agendaLiveState({ startsAt, endsAt, timezone, agenda }, now);
  return (
    <ol className="gp-timeline mt-2" data-testid="event-agenda" style={{ "--fill": live?.fill ?? 0 } as CSSProperties}>
      {agenda.map((item, index) => {
        const state = live?.states[index] ?? "upcoming";
        return (
          <li key={`${item.start}-${item.title}`} className="gp-slot" data-state={state} data-testid="agenda-slot">
            <span className="flex size-12 shrink-0 items-center justify-center bg-[#e0262f] text-white">
              {index === agenda.length - 1 ? <Mic2 aria-hidden className="size-6" /> : <Music aria-hidden className="size-6" />}
            </span>
            <div className="min-w-0">
              <div className="gp-display text-[34px] leading-none">{item.title}</div>
              <div className="mt-1.5 text-base font-bold tracking-[0.12em] text-[#c8ff9f]">
                {agendaClock(item.start)} – {agendaClock(item.end)} {zone}
              </div>
            </div>
            {state === "live" ? (
              <span className="gp-live-badge ml-auto shrink-0" data-testid="agenda-live">
                <span className="gp-eq" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                LIVE
              </span>
            ) : SLOT_TAG[state] ? (
              <span className="gp-slot-tag">{SLOT_TAG[state]}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const INTRO_KEY = "garage-invite-intro";
const INTRO_EVENT = "garage-invite-intro-change";
function subscribeIntro(callback: () => void) {
  window.addEventListener(INTRO_EVENT, callback);
  return () => window.removeEventListener(INTRO_EVENT, callback);
}
function readIntroSeen() {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Intro "membuka amplop" undangan (±2 detik, sekali per sesi). Animasi CSS
 * menyembunyikan dirinya sendiri; tombol Lewati untuk langsung ke isi.
 * Tanpa JS / reduced motion: tidak tampil.
 */
export function InviteIntro({ guestName, children }: { guestName: string; children: ReactNode }) {
  const seen = useSyncExternalStore(subscribeIntro, readIntroSeen, () => false);

  useEffect(() => {
    if (seen) return;
    try {
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // penyimpanan diblokir — intro tetap selesai sendiri
    }
  }, [seen]);

  if (seen) return null;

  function skip() {
    try {
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // abaikan
    }
    window.dispatchEvent(new Event(INTRO_EVENT));
  }

  return (
    <div className="gp-intro" data-age-keep data-testid="invite-intro" onAnimationEnd={(event) => event.target === event.currentTarget && skip()}>
      <noscript>
        <style>{".gp-intro{display:none!important}"}</style>
      </noscript>
      <span className="gp-intro-laser" aria-hidden />
      <span className="gp-intro-panel" aria-hidden />
      <div className="gp-intro-content" aria-hidden>
        {children}
        <p className="gp-label">Undangan pribadi untuk</p>
        <p className="gp-display text-[44px] leading-none text-[#efe6d6] sm:text-[64px]">{guestName}</p>
      </div>
      <button type="button" onClick={skip} className="gp-intro-skip" data-testid="invite-intro-skip">
        Lewati
      </button>
    </div>
  );
}

/**
 * Hitung mundur di banner beranda (hari/jam/menit/detik). Sebelum hidrasi tampil
 * "--" dengan ukuran sama (tanpa lompatan layout); saat acara berjalan → badge LIVE.
 */
export function HomeCountdown({
  startsAt,
  endsAt,
  label = "Hitung mundur menuju Grand Opening",
}: {
  startsAt: string;
  endsAt: string;
  label?: string;
}) {
  const now = useSyncExternalStore(subscribeSecond, currentSecond, serverSecond);
  const phase = now === null ? "upcoming" : eventPhase({ startsAt, endsAt }, now);
  if (phase === "ended") return null;
  if (phase === "live") {
    return (
      <p className="go-count__live" data-testid="home-event-live">
        <span className="go-count__eq" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        Sedang berlangsung — langsung datang!
      </p>
    );
  }
  const parts = now === null ? null : countdownParts(startsAt, now);
  const cells = [
    { label: "Hari", value: parts?.days },
    { label: "Jam", value: parts?.hours },
    { label: "Menit", value: parts?.minutes },
    { label: "Detik", value: parts?.seconds },
  ];
  return (
    <div className="go-count" role="timer" aria-label={label} data-testid="home-event-countdown">
      {cells.map((cell) => {
        const text = cell.value === undefined ? "--" : String(cell.value).padStart(2, "0");
        return (
          <div key={cell.label} className="go-count__cell">
            <span className="go-count__num" aria-label={`${text} ${cell.label}`}>
              {text.split("").map((ch, index) => (
                <span key={`${index}-${ch}`} className="go-count__digit" aria-hidden>
                  {ch}
                </span>
              ))}
            </span>
            <span className="go-count__label">{cell.label}</span>
          </div>
        );
      })}
    </div>
  );
}
