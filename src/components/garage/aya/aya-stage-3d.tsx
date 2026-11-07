"use client";

// AYA 3D (master prompt V5 §6). Three.js hanya dimuat (dynamic import) saat komponen ini tampil
// di perangkat yang mendukung WebGL; selain itu — atau bila pemuatan gagal / context hilang —
// tampil AyaMascot 2D (aya-rig resmi) dengan state yang sama lewat presenceTo2D.
// - Render berhenti saat tidak terlihat (IntersectionObserver) atau tab disembunyikan.
// - prefers-reduced-motion → satu frame statis per perubahan state (tanpa loop).
// - Hemat data / perangkat lemah (≤ 2 core) → langsung 2D.
import { useEffect, useRef, useState } from "react";

import { AyaMascot } from "./aya-mascot";
import { AYA_PRESENCE_LABEL, presenceTo2D, type AyaPresence } from "./aya-presence";
import type { AyaSceneController } from "./aya-stage-3d-scene";

type Mode = "pending" | "3d" | "2d";

function webglSupported() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function lowPowerDevice() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2) return true;
  return typeof nav.deviceMemory === "number" && nav.deviceMemory < 2;
}

export function AyaStage3D({
  presence,
  pointDir = 1,
  followPointer = true,
  className,
  role = "customer",
  forceFallback = false,
}: {
  presence: AyaPresence;
  pointDir?: -1 | 1;
  /** Mata/kepala mengikuti kursor/sentuhan di dalam halaman. */
  followPointer?: boolean;
  className?: string;
  role?: "customer" | "staff";
  /** Uji/QA: paksa fallback 2D. */
  forceFallback?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controller = useRef<AyaSceneController | null>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const presenceRef = useRef(presence);
  const pointRef = useRef(pointDir);

  // Pilih renderer setelah mount (SSR tidak tahu kemampuan perangkat).
  useEffect(() => {
    const ok = !forceFallback && webglSupported() && !lowPowerDevice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kemampuan browser baru diketahui setelah mount
    setMode(ok ? "3d" : "2d");
  }, [forceFallback]);

  // Muat scene Three.js secara lazy.
  useEffect(() => {
    if (mode !== "3d") return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let intersection: IntersectionObserver | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    const sync = () => controller.current?.setActive(visible && document.visibilityState !== "hidden");
    const onVisibility = () => sync();

    import("./aya-stage-3d-scene")
      .then(({ createAyaScene }) => createAyaScene(canvas, { reducedMotion: reduced, onContextLost: () => setMode("2d") }))
      .then((scene) => {
        if (cancelled) {
          scene.dispose();
          return;
        }
        controller.current = scene;
        scene.setPointDir(pointRef.current);
        scene.setPresence(presenceRef.current);
        const rect = wrap.getBoundingClientRect();
        scene.resize(rect.width, rect.height);
        resizeObserver = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
        resizeObserver.observe(wrap);
        intersection = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        });
        intersection.observe(wrap);
        document.addEventListener("visibilitychange", onVisibility);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setMode("2d");
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controller.current?.dispose();
      controller.current = null;
      setReady(false);
    };
  }, [mode]);

  useEffect(() => {
    presenceRef.current = presence;
    controller.current?.setPresence(presence);
  }, [presence, ready]);

  useEffect(() => {
    pointRef.current = pointDir;
    controller.current?.setPointDir(pointDir);
  }, [pointDir, ready]);

  // Lirik mengikuti pointer (diredam di scene; hanya saat 3D siap).
  useEffect(() => {
    if (!followPointer || !ready) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * 0.4;
        controller.current?.setLook((event.clientX - cx) / (window.innerWidth / 2), (event.clientY - cy) / (window.innerHeight / 2));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [followPointer, ready]);

  const fallback = presenceTo2D(presence);
  const show2D = mode !== "3d" || !ready;

  return (
    <div
      ref={wrapRef}
      className={`relative ${className ?? ""}`}
      role="img"
      aria-label={`AYA, asisten digital Garage Coffee — ${AYA_PRESENCE_LABEL[presence]}`}
      data-aya-renderer={mode === "3d" && ready ? "3d" : "2d"}
      data-aya-presence={presence}
    >
      {mode === "3d" ? (
        <canvas
          ref={canvasRef}
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {show2D ? (
        <span className="absolute inset-0" aria-hidden>
          <AyaMascot state={fallback.state} motion={fallback.motion} effect={fallback.effect} role={role} />
        </span>
      ) : null}
    </div>
  );
}
