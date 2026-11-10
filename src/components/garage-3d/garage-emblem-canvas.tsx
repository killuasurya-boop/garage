"use client";

// Kanvas adegan 3D emblem Garage. Tanpa efek di server; three.js baru diunduh (dynamic import) setelah halaman idle
// dan hanya bila perangkat layak (decideScene). Gagal / tak ada WebGL / hemat data → tidak menampilkan apa pun
// (halaman tetap utuh dengan latar aslinya). Pointer-events dimatikan: tidak pernah menghalangi tombol.
import { useEffect, useRef } from "react";

import { decideScene } from "./scene-math";
import type { GarageSceneHandle, SceneOptions } from "./emblem-scene";

export const EMBLEM_URL = "/garage-brand/garage-coffee-emblem.png";

export type EmblemVariant = "landing" | "stage";

const VARIANTS: Record<EmblemVariant, Pick<SceneOptions, "viewRadius" | "offset" | "beams" | "scale">> = {
  // Latar hero website: besar di belakang judul, dengan sinar laser melintang.
  landing: { viewRadius: 3.3, offset: [0, 0.1], beams: true, scale: 1.55 },
  // Panggung hero /order: emblem + cincin muat di kotak kecil, sedikit ke atas (kartu menu di depan-bawah).
  stage: { viewRadius: 3.1, offset: [0.02, 0.34], beams: false, scale: 1.8 },
};

// HP: emblem naik ke belakang judul (di atas paragraf & tombol) dan tanpa sinar melintang.
const PHONE_LANDING: Pick<SceneOptions, "viewRadius" | "offset" | "beams" | "scale"> = { viewRadius: 3.3, offset: [0, 0.4], beams: false, scale: 1.3 };

function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 2200 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 700);
  return () => window.clearTimeout(id);
}

export function GarageEmblemCanvas({
  variant,
  className = "",
  onReady,
}: {
  variant: EmblemVariant;
  className?: string;
  /** Dipanggil saat adegan 3D tampil (mis. untuk menyembunyikan gambar statis pengganti). */
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const decision = decideScene({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      saveData: nav.connection?.saveData === true,
      deviceMemory: nav.deviceMemory,
      cores: navigator.hardwareConcurrency,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      width: window.innerWidth,
    });
    if (decision.mode === "off") return;

    let cancelled = false;
    let handle: GarageSceneHandle | null = null;
    const cleanups: Array<() => void> = [];

    const cancelIdle = whenIdle(() => {
      void import("./emblem-scene")
        .then(({ createGarageScene }) =>
          createGarageScene(canvas, {
            emblemUrl: EMBLEM_URL,
            quality: decision.quality,
            animate: decision.mode === "animated",
            ...(variant === "landing" && window.innerWidth < 700 ? PHONE_LANDING : VARIANTS[variant]),
          }),
        )
        .then((scene) => {
          if (cancelled) {
            scene.dispose();
            return;
          }
          handle = scene;

          // Preferensi "kurangi gerak" diikuti saat berubah di tengah jalan: animasi di adegan yang sama dihentikan
          // (bingkai diam) atau dilanjutkan — tanpa membuat renderer baru di kanvas yang konteksnya sudah dilepas.
          const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
          const onMotionChange = () => scene.setAnimate(!motionQuery.matches);
          motionQuery.addEventListener("change", onMotionChange);
          cleanups.push(() => motionQuery.removeEventListener("change", onMotionChange));
          canvas.dataset.ready = "true";
          readyRef.current?.();

          const host = canvas.parentElement ?? canvas;
          const resize = new ResizeObserver(() => scene.resize());
          resize.observe(host);
          const io = new IntersectionObserver(([entry]) => scene.setVisible(entry.isIntersecting), { threshold: 0 });
          io.observe(canvas);
          cleanups.push(() => resize.disconnect(), () => io.disconnect());

          // Kursor (desktop) → emblem condong; HP: tanpa pointer, cukup gerak idle + scroll.
          if (!window.matchMedia("(pointer: coarse)").matches) {
            let queued = false;
            const onMove = (event: PointerEvent) => {
              if (queued) return;
              queued = true;
              requestAnimationFrame(() => {
                queued = false;
                scene.setPointer((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
              });
            };
            window.addEventListener("pointermove", onMove, { passive: true });
            cleanups.push(() => window.removeEventListener("pointermove", onMove));
          }
          if (variant === "landing") {
            const onScroll = () => scene.setScroll(window.scrollY / Math.max(1, window.innerHeight));
            onScroll();
            window.addEventListener("scroll", onScroll, { passive: true });
            cleanups.push(() => window.removeEventListener("scroll", onScroll));
          }
        })
        .catch(() => {
          // WebGL tidak tersedia / gagal memuat: diam saja, halaman tetap utuh.
          canvas.dataset.ready = "failed";
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      cleanups.forEach((fn) => fn());
      handle?.dispose();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className={`gm-3d ${className}`} aria-hidden="true" data-variant={variant} />;
}
