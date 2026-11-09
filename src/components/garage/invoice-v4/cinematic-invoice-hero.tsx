"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lapisan 3D hero invoice. Hanya dimuat bila: layar ≥ 1024px, pointer halus,
 * tidak reduced-motion, WebGL ada, dan perangkat tidak lemah (≥ 4 core).
 * Selain itu tidak ada canvas sama sekali — hero tetap utuh tanpa 3D.
 */
export function CinematicInvoiceHero() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const ok =
      window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      (navigator.hardwareConcurrency ?? 4) >= 4 &&
      Boolean(document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kapabilitas perangkat sekali saat mount
    setEnabled(ok);
  }, []);

  useEffect(() => {
    if (!enabled || !canvasRef.current || !hostRef.current) return;
    let disposed = false;
    let controller: { resize: (w: number, h: number) => void; dispose: () => void } | null = null;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const observer = new ResizeObserver(([entry]) => {
      controller?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    import("./invoice-hero-scene")
      .then(({ createHeroScene }) => {
        if (disposed) return;
        const rect = host.getBoundingClientRect();
        controller = createHeroScene(canvas, Math.max(1, rect.width), Math.max(1, rect.height));
        observer.observe(host);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      observer.disconnect();
      controller?.dispose();
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={hostRef} className="iv-hero-canvas" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
