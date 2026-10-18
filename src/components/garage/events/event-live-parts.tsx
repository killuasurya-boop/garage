"use client";

import { useState, useSyncExternalStore } from "react";
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
