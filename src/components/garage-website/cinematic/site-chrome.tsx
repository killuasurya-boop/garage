"use client";

// Tombol Sound ON/OFF (default OFF) dan indikator progres scroll (ScrollTrigger, scaleX → GPU).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { readSiteSound, setSiteSound, subscribeSiteSound } from "./site-sfx";

export function SiteSoundToggle({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(subscribeSiteSound, readSiteSound, () => false);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      className={`cine-sound ${className}`}
      aria-pressed={on}
      aria-label={on ? "Matikan efek suara" : "Nyalakan efek suara"}
      title={on ? "Suara: ON" : "Suara: OFF"}
      onClick={() => setSiteSound(!on)}
    >
      <Icon size={18} aria-hidden />
      <span className="cine-sound-label">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

export function ScrollProgress() {
  const bar = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const tween = gsap.to(el, {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);
  return (
    <div className="cine-progress" aria-hidden>
      <span ref={bar} />
    </div>
  );
}
