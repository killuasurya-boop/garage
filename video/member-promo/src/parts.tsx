// Komponen visual video promo member (Black Crystal × Red Laser). Semua animasi deterministik dari frame
// (useCurrentFrame + interpolate/spring) — tidak ada Math.random / CSS transition, sesuai aturan Remotion.
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const display = loadMontserrat("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily;
export const body = loadInter("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily;

export const RED = "#eb202d";
export const LASER = "#ff2638";
export const SILVER = "#c8c9cd";

export type Tier = "silver" | "gold" | "platinum";

const TIER: Record<Tier, { label: string; base: string; accent: string; text: string; glow: string }> = {
  silver: { label: "SILVER", base: "linear-gradient(135deg,#24262c,#0b0c0e 62%)", accent: "#dfe3ee", text: "#eceef2", glow: "rgba(220,228,255,0.55)" },
  gold: { label: "GOLD", base: "linear-gradient(135deg,#2c2216,#0a0806 62%)", accent: "#e2b45e", text: "#f1c977", glow: "rgba(255,186,84,0.65)" },
  platinum: { label: "PLATINUM", base: "linear-gradient(135deg,#1c1d22,#08090b 62%)", accent: "#c8c9cd", text: "#eceef2", glow: "rgba(255,38,56,0.7)" },
};

/** Latar: aspal gelap + cahaya merah + dua garis laser yang bergerak pelan. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 40) * 60;
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(60% 45% at 30% 20%, rgba(235,32,45,0.22), transparent 62%), radial-gradient(50% 40% at 90% 95%, rgba(235,32,45,0.14), transparent 70%), linear-gradient(180deg,#0d0d10,#08090b 60%)",
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "-20%",
            right: "-20%",
            top: `${28 + i * 34}%`,
            height: 3,
            transform: `translateX(${drift * (i ? -1 : 1)}px) rotate(${i ? -9 : -16}deg)`,
            background: `linear-gradient(90deg, transparent, ${LASER} 45%, #ffd1d4 50%, ${LASER} 55%, transparent)`,
            boxShadow: `0 0 24px ${LASER}`,
            opacity: 0.35 + i * 0.1,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Kartu member 2,5D (CSS 3D): logo resmi, nama tier, tepi bercahaya, kilau yang menyapu. Tanpa chip/NFC. */
export const MemberCard: React.FC<{ tier: Tier; width: number; rotateY?: number; sweep?: number }> = ({ tier, width, rotateY = 0, sweep = 0 }) => {
  const t = TIER[tier];
  const height = width / 1.585;
  return (
    <div style={{ perspective: 1400 }}>
      <div
        style={{
          position: "relative",
          width,
          height,
          borderRadius: width * 0.055,
          background: t.base,
          border: `2px solid ${t.accent}`,
          boxShadow: `0 0 ${width * 0.12}px ${t.glow}, 0 ${width * 0.1}px ${width * 0.2}px rgba(0,0,0,0.7), inset 0 2px 0 rgba(255,255,255,0.18)`,
          transform: `rotateY(${rotateY}deg)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.12), transparent 45%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "35%",
            left: `${-40 + sweep * 140}%`,
            background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent)",
          }}
        />
        <Img
          src={staticFile("garage-coffee-logo.png")}
          style={{ position: "absolute", left: "50%", top: "11%", width: "46%", transform: "translateX(-50%)", objectFit: "contain" }}
        />
        <div
          style={{
            position: "absolute",
            right: "8%",
            bottom: "12%",
            textAlign: "right",
            color: t.text,
            fontFamily: display,
            fontWeight: 800,
            fontSize: width * (tier === "platinum" ? 0.1 : 0.12),
            letterSpacing: "0.04em",
            lineHeight: 1,
            textShadow: "0 4px 12px rgba(0,0,0,0.6)",
          }}
        >
          {t.label}
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: width * 0.035, letterSpacing: "0.5em", color: "rgba(255,255,255,0.7)", marginTop: width * 0.02 }}>
            MEMBER
          </div>
        </div>
      </div>
    </div>
  );
};

/** Masuk dari bawah + fade dengan spring (tanpa bounce berlebihan). */
export function useRise(delay: number, distance = 40) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [distance, 0])}px)` };
}

export const Eyebrow: React.FC<{ children: React.ReactNode; size: number }> = ({ children, size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.9, color: SILVER, fontFamily: body, fontWeight: 600, fontSize: size, letterSpacing: "0.32em" }}>
    <span style={{ width: size * 0.25, height: size * 1.4, background: RED, boxShadow: `0 0 12px ${RED}` }} />
    {children}
  </div>
);
