// Video promo "Jadi Member Garage Coffee" — 15 dtk @30fps. Isi hanya fakta program member (poin tiap order, voucher &
// promo member, riwayat transaksi, tier Silver/Gold/Platinum) dan aset resmi (logo, emblem, foto es kopi asli).
import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { Backdrop, body, display, Eyebrow, MemberCard, RED, SILVER, useRise, type Tier } from "./parts";

export type PromoProps = { layout: "vertical" | "wide" };

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const laser = interpolate(frame, [4, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logo = interpolate(frame, [18, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweep = interpolate(frame, [30, 58], [-120, 120], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "#050506" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 3,
          transform: `scaleX(${laser})`,
          background: "linear-gradient(90deg, transparent, #ff2638 40%, #ffd1d4 50%, #ff2638 60%, transparent)",
          boxShadow: "0 0 24px #ff2638",
        }}
      />
      <div style={{ position: "relative", width: width * 0.62, opacity: logo, filter: `brightness(${0.6 + logo * 0.4})`, overflow: "hidden" }}>
        <Img src={staticFile("garage-coffee-logo.png")} style={{ width: "100%", objectFit: "contain" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            // Kilau bergerak lewat background-position; mask = bentuk logo, jadi hanya huruf yang tersapu cahaya.
            backgroundImage: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.75) 50%, transparent 60%)",
            backgroundSize: "300% 100%",
            backgroundPosition: `${interpolate(sweep, [-120, 120], [100, 0])}% 0`,
            WebkitMaskImage: `url(${staticFile("garage-coffee-logo.png")})`,
            WebkitMaskSize: "100% 100%",
            maskImage: `url(${staticFile("garage-coffee-logo.png")})`,
            maskSize: "100% 100%",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Cards: React.FC<PromoProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const vertical = layout === "vertical";
  const head = useRise(0);
  const cardW = vertical ? width * 0.66 : width * 0.22;
  const tiers: Tier[] = ["silver", "gold", "platinum"];
  const sweep = interpolate(frame % 75, [0, 75], [0, 1]);
  return (
    <AbsoluteFill style={{ padding: vertical ? "160px 80px" : "110px 140px", flexDirection: vertical ? "column" : "row", alignItems: "center", gap: vertical ? 70 : 90 }}>
      <div style={{ ...head, flex: vertical ? "none" : 1 }}>
        <Eyebrow size={vertical ? 30 : 26}>MEMBER PROGRAM</Eyebrow>
        <div style={{ marginTop: 26, color: "#f5f5f5", fontFamily: display, fontWeight: 800, fontSize: vertical ? 104 : 96, lineHeight: 1.02, letterSpacing: "-0.015em" }}>
          Lebih dari
          <br />
          Sekadar Ngopi<span style={{ color: RED }}>.</span>
        </div>
        <div style={{ marginTop: 24, color: SILVER, fontFamily: body, fontSize: vertical ? 40 : 34, lineHeight: 1.4, maxWidth: 820 }}>
          Daftar gratis dan kumpulkan poin di setiap order.
        </div>
      </div>
      <div style={{ position: "relative", flex: vertical ? 1 : 1.1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {tiers.map((tier, index) => {
          const p = spring({ frame: frame - 12 - index * 9, fps, config: { damping: 18, mass: 0.9 } });
          const float = Math.sin((frame + index * 20) / 22) * 8;
          // Kartu depan menutupi bagian atas/kiri kartu berikutnya, sehingga nama tier (kanan bawah) tiap kartu tetap terbaca.
          const x = vertical ? (index - 1) * 40 : (index - 1) * 250;
          const y = vertical ? (index - 1) * 250 : (index - 1) * -50;
          return (
            <div
              key={tier}
              style={{
                position: "absolute",
                transform: `translate(${x}px, ${(1 - p) * 300 + float + y}px) scale(${0.6 + p * 0.4})`,
                opacity: p,
                zIndex: 3 - index,
              }}
            >
              <MemberCard tier={tier} width={cardW} rotateY={(index - 1) * -14} sweep={sweep} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const BENEFITS = [
  { title: "Poin", sub: "Setiap order", icon: "coin" },
  { title: "Voucher", sub: "& promo member", icon: "ticket" },
  { title: "Riwayat", sub: "Transaksi", icon: "chart" },
] as const;

function BenefitIcon({ kind, size }: { kind: (typeof BENEFITS)[number]["icon"]; size: number }) {
  const stroke = { fill: "none", stroke: "#ff6b75", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {kind === "coin" ? (
        <>
          <ellipse cx="12" cy="7" rx="7" ry="3" {...stroke} />
          <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" {...stroke} />
          <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" {...stroke} />
        </>
      ) : kind === "ticket" ? (
        <>
          <path d="M3 8a2 2 0 0 0 0 8v2h18v-2a2 2 0 0 0 0-8V6H3z" {...stroke} />
          <path d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" {...stroke} />
        </>
      ) : (
        <>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke} />
        </>
      )}
    </svg>
  );
}

const Benefits: React.FC<PromoProps> = ({ layout }) => {
  const vertical = layout === "vertical";
  const head = useRise(0);
  return (
    <AbsoluteFill style={{ padding: vertical ? "200px 90px" : "120px 160px", justifyContent: "center", gap: vertical ? 70 : 54 }}>
      <div style={head}>
        <Eyebrow size={vertical ? 30 : 26}>KEUNTUNGAN MEMBER</Eyebrow>
        <div style={{ marginTop: 22, color: "#f5f5f5", fontFamily: display, fontWeight: 800, fontSize: vertical ? 92 : 84, lineHeight: 1.05 }}>
          Ngopi dapat <span style={{ color: RED }}>poin</span>.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 40 : 48 }}>
        {BENEFITS.map((item, index) => (
          <BenefitRow key={item.title} item={item} index={index} vertical={vertical} />
        ))}
      </div>
      <TierLine vertical={vertical} />
    </AbsoluteFill>
  );
};

const BenefitRow: React.FC<{ item: (typeof BENEFITS)[number]; index: number; vertical: boolean }> = ({ item, index, vertical }) => {
  const style = useRise(10 + index * 8, 30);
  const box = vertical ? 120 : 104;
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", gap: 30, flex: vertical ? "none" : 1 }}>
      <div
        style={{
          display: "grid",
          width: box,
          height: box,
          placeItems: "center",
          borderRadius: 26,
          border: "2px solid rgba(235,32,45,0.6)",
          background: "linear-gradient(160deg, rgba(235,32,45,0.22), rgba(0,0,0,0.3))",
          boxShadow: "0 0 30px rgba(235,32,45,0.3)",
        }}
      >
        <BenefitIcon kind={item.icon} size={box * 0.5} />
      </div>
      <div>
        <div style={{ color: "#f5f5f5", fontFamily: display, fontWeight: 800, fontSize: vertical ? 56 : 46 }}>{item.title}</div>
        <div style={{ color: SILVER, fontFamily: body, fontSize: vertical ? 36 : 30 }}>{item.sub}</div>
      </div>
    </div>
  );
};

const TierLine: React.FC<{ vertical: boolean }> = ({ vertical }) => {
  const style = useRise(40, 20);
  const colors = ["#dfe3ee", "#e2b45e", "#ff5362"];
  return (
    <div style={{ ...style, display: "flex", gap: 24, alignItems: "center", fontFamily: display, fontWeight: 800, fontSize: vertical ? 40 : 34, letterSpacing: "0.18em" }}>
      {["SILVER", "GOLD", "PLATINUM"].map((label, index) => (
        <React.Fragment key={label}>
          {index ? <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span> : null}
          <span style={{ color: colors[index] }}>{label}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

const Cta: React.FC<PromoProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const vertical = layout === "vertical";
  const photo = useRise(0, 60);
  const text = useRise(10, 30);
  const pulse = 0.5 + Math.sin(frame / 8) * 0.15;
  return (
    <AbsoluteFill style={{ padding: vertical ? "170px 90px" : "110px 150px", flexDirection: vertical ? "column" : "row", alignItems: "center", justifyContent: "center", gap: vertical ? 70 : 100 }}>
      <div
        style={{
          ...photo,
          width: vertical ? 760 : 720,
          aspectRatio: "16 / 10.7",
          borderRadius: 40,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.12)",
          boxShadow: `0 0 0 2px rgba(255,38,56,${pulse}), 0 40px 90px rgba(0,0,0,0.6)`,
        }}
      >
        <Img src={staticFile("hero-iced-latte.webp")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ ...text, textAlign: vertical ? "center" : "left" }}>
        <Img src={staticFile("garage-coffee-logo.png")} style={{ width: vertical ? 520 : 460, objectFit: "contain" }} />
        <div style={{ marginTop: 30, color: "#f5f5f5", fontFamily: display, fontWeight: 800, fontSize: vertical ? 88 : 80, lineHeight: 1.04 }}>
          Daftar <span style={{ color: RED }}>gratis</span>
          <br />
          sekarang.
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 34,
            padding: vertical ? "26px 46px" : "22px 40px",
            borderRadius: 999,
            background: "linear-gradient(180deg,#f0333a,#e1252b 55%,#b9161d)",
            color: "#fff",
            fontFamily: body,
            fontWeight: 700,
            fontSize: vertical ? 40 : 34,
            boxShadow: "0 14px 40px rgba(225,37,43,0.5)",
          }}
        >
          garagecoffee.id/member-login
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Fade antar-scene tanpa lompatan. */
const Fade: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, duration - 12, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const MemberPromo: React.FC<PromoProps> = ({ layout }) => (
  <AbsoluteFill style={{ backgroundColor: "#08090b" }}>
    <Backdrop />
    <Sequence durationInFrames={75}>
      <Intro />
    </Sequence>
    <Sequence from={66} durationInFrames={144}>
      <Fade duration={144}>
        <Cards layout={layout} />
      </Fade>
    </Sequence>
    <Sequence from={200} durationInFrames={130}>
      <Fade duration={130}>
        <Benefits layout={layout} />
      </Fade>
    </Sequence>
    <Sequence from={320} durationInFrames={130}>
      <AbsoluteFill>
        <Cta layout={layout} />
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);
