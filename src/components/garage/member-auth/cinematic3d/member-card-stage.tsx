"use client";

// Panggung kartu member 3D (Member V6). Scene Three.js dimuat lazy setelah form HTML tampil; WebGL tidak ada /
// gagal → fallback kartu CSS bertema sama. Pointer: tilt + orbit terbatas; kembali netral saat keluar.
// Hanya dekoratif (aria-hidden); semua info penting ada di teks halaman.
import { useEffect, useRef, useState } from "react";

import type { CardTier, MemberCardSceneController } from "./member-card-scene";

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function tierKey(tier: string | null | undefined): CardTier {
  const key = String(tier ?? "").toLowerCase();
  if (key.includes("ultra")) return "ultra";
  if (key.includes("platinum")) return "platinum";
  if (key.includes("gold")) return "gold";
  return "silver";
}

const FALLBACK: Array<{ tier: CardTier; label: string; className: string }> = [
  { tier: "platinum", label: "PLATINUM", className: "gm6-fb-card gm6-fb-platinum" },
  { tier: "gold", label: "GOLD", className: "gm6-fb-card gm6-fb-gold" },
  { tier: "silver", label: "SILVER", className: "gm6-fb-card gm6-fb-silver" },
];

export function MemberCardStage({
  mode = "showcase",
  tier,
  focus,
  className,
  testId = "member-card-stage",
}: {
  mode?: "showcase" | "success" | "tiers";
  tier?: CardTier;
  /** Mode tiers: indeks kartu yang difokus (0 Silver, 1 Gold, 2 Platinum). */
  focus?: number;
  className?: string;
  testId?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MemberCardSceneController | null>(null);
  const focusRef = useRef(focus);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (!webglAvailable()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kemampuan browser sekali saat mount
      setState("fallback");
      return;
    }
    let controller: MemberCardSceneController | null = null;
    let cancelled = false;
    const narrow = window.innerWidth < 768;
    const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    const quality = narrow || cores <= 4 ? "low" : "high";
    const resize = () => {
      const rect = host.getBoundingClientRect();
      controller?.resize(rect.width, rect.height);
    };
    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([entry]) => controller?.setActive(entry.isIntersecting), { threshold: 0.01 });
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = host.getBoundingClientRect();
      controller?.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
    };
    const onLeave = () => controller?.setPointer(null);

    // Form HTML tampil dulu; bundel 3D dimuat setelah itu.
    const idle = window.setTimeout(() => {
      import("./member-card-scene")
        .then(({ createMemberCardScene }) =>
          createMemberCardScene(canvas, { mode, tier, quality, reducedMotion: prefersReducedMotion() }),
        )
        .then((created) => {
          if (cancelled) {
            created.dispose();
            return;
          }
          controller = created;
          controllerRef.current = created;
          if (typeof focusRef.current === "number") created.setFocus(focusRef.current);
          resize();
          ro.observe(host);
          io.observe(host);
          setState("ready");
        })
        .catch(() => {
          if (!cancelled) setState("fallback");
        });
    }, 60);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelled = true;
      window.clearTimeout(idle);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      controller?.dispose();
      controllerRef.current = null;
    };
  }, [mode, tier]);

  useEffect(() => {
    focusRef.current = focus;
    if (typeof focus === "number") controllerRef.current?.setFocus(focus);
  }, [focus]);

  return (
    <div ref={hostRef} className={`gm6-stage ${className ?? ""}`} aria-hidden="true" data-testid={testId} data-state={state}>
      <canvas ref={canvasRef} className="gm6-stage-canvas" data-ready={state === "ready" ? "true" : undefined} />
      {state === "fallback" ? (
        <div className="gm6-fb">
          {(mode === "success" ? FALLBACK.filter((card) => card.tier === (tier ?? "silver")) : FALLBACK).map((card) => (
            <div key={card.tier} className={card.className}>
              <span className="gm6-fb-label">{card.label}</span>
              <span className="gm6-fb-sub">MEMBER</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
