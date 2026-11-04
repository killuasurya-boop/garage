"use client";

// Panduan cara pesan Aya di /order (OD-01, A2). Aya menggulir halaman ke tombol yang dibahas,
// terbang ke sampingnya, menunjuk dengan tangan (state guiding), dan menyorot tombol itu.
// Aya tidak menekan tombol & tidak mengisi data; scroll hanya setelah customer meminta panduan,
// dan panduan berhenti sendiri begitu customer menggulir/menutup Aya. Tanpa layanan luar (OD-03).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { buildOrderGuideSteps, petSpotBeside, pickVisible, type AyaGuideContext } from "@/lib/aya-order-guide";
import { AYA_NAME } from "@/lib/garage-ai-persona";

export type AyaPetGuide = { x: number; y: number; faceLeft: boolean; bubble: "above" | "below" };

const SPOT_ATTR = "data-aya-spotlight";
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "]);

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearSpotlight() {
  document.querySelectorAll(`[${SPOT_ATTR}]`).forEach((el) => el.removeAttribute(SPOT_ATTR));
}

/** Tunggu gulir halus selesai (scrollend bila ada; cadangan waktu). */
function afterScroll(done: () => void) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("scrollend", finish);
    done();
  };
  window.addEventListener("scrollend", finish, { once: true });
  window.setTimeout(finish, reducedMotion() ? 60 : 700);
}

export function useAyaOrderGuide(ctx: AyaGuideContext & { blocked?: boolean }, petSize = 72) {
  const [index, setIndex] = useState<number | null>(null);
  const [petGuide, setPetGuide] = useState<AyaPetGuide | null>(null);
  const { orderingOpen, hasCart, hasOrderType, orderType } = ctx;
  const steps = useMemo(
    () => buildOrderGuideSteps({ orderingOpen, hasCart, hasOrderType, orderType }),
    [orderingOpen, hasCart, hasOrderType, orderType],
  );
  const active = index !== null;
  const current = index === null ? null : Math.min(index, steps.length - 1);
  const step = current === null ? null : steps[current];
  const anchor = step?.anchor ?? null;
  const seq = useRef(0);

  const stop = useCallback(() => {
    seq.current += 1;
    setIndex(null);
    setPetGuide(null);
    clearSpotlight();
  }, []);

  // Pindah langkah: gulir ke tombol, sorot, lalu beri tahu Aya posisi di sampingnya.
  useEffect(() => {
    if (!active) return;
    const run = ++seq.current;
    clearSpotlight();
    if (!anchor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- langkah tanpa tombol: Aya tetap di tempat
      setPetGuide(null);
      return;
    }
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-aya-anchor="${anchor}"]`));
    const target = pickVisible(nodes.map((el) => ({ el, rect: el.getBoundingClientRect() })))?.el;
    if (!target) {
      setPetGuide(null);
      return;
    }
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    const place = () => {
      if (run !== seq.current) return;
      target.setAttribute(SPOT_ATTR, "true");
      const r = target.getBoundingClientRect();
      setPetGuide(petSpotBeside({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, petSize));
    };
    afterScroll(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, current, anchor, petSize]);

  // Customer menggulir sendiri → panduan berhenti (Aya tidak menarik layar saat orang membaca).
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) stop();
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, stop]);

  // Layar lain menutupi halaman (pilih tipe pesanan / pilih meja) → panduan berhenti.
  const blocked = ctx.blocked === true;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- berhenti mengikuti keadaan halaman
    if (blocked && active) stop();
  }, [blocked, active, stop]);

  useEffect(() => () => clearSpotlight(), []);

  return {
    active,
    step,
    index: current ?? 0,
    total: steps.length,
    petGuide,
    start: useCallback(() => setIndex(0), []),
    next: useCallback(() => setIndex((i) => (i === null ? 0 : i + 1)), []),
    prev: useCallback(() => setIndex((i) => (i === null ? 0 : Math.max(0, i - 1))), []),
    stop,
  };
}

/** Isi balon Aya selama panduan. */
export function AyaGuideBubble({
  title,
  text,
  index,
  total,
  onPrev,
  onNext,
  onStop,
}: {
  title: string;
  text: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onStop: () => void;
}) {
  const last = index >= total - 1;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-garage-amber">
            Cara pesan · {index + 1}/{total}
          </p>
          <p className="mt-0.5 text-base font-bold text-white">{title}</p>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="-mr-1 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-garage-dim transition-colors hover:bg-garage-bg-3 hover:text-white"
          aria-label={`Tutup panduan ${AYA_NAME}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-garage-dim" aria-live="polite">
        {text}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          className="garage-press flex h-10 cursor-pointer items-center gap-1 rounded-md border border-garage-line-2 px-3 text-sm font-bold text-white transition-colors hover:bg-garage-bg-3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Kembali
        </button>
        <button
          type="button"
          onClick={last ? onStop : onNext}
          className="garage-press flex h-10 cursor-pointer items-center gap-1 rounded-md bg-garage-red px-3 text-sm font-bold text-white transition-colors hover:bg-garage-red-bright"
        >
          {last ? "Siap, pesan!" : "Lanjut"}
          {last ? null : <ChevronRight className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
