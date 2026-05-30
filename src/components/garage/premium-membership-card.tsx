"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import QRCode from "qrcode";

import type { MemberLevel } from "@/lib/member-types";

export type PremiumMembershipCardData = {
  name: string;
  memberId: string;
  phone?: string | null;
  address?: string | null;
  tier: MemberLevel;
  membershipSince?: string | Date | null;
  photoUrl?: string | null;
  validThru?: string | null;
};

export type PremiumMembershipCardProps = {
  data: PremiumMembershipCardData;
  side?: "front" | "back";
  flippable?: boolean;
  interactive?: boolean;
  className?: string;
  ariaLabel?: string;
};

type TierTheme = {
  label: string;
  className: string;
  badge: string;
  /** Primary gradient for card surface */
  surfaceGradient: string;
  /** Subtle pattern overlay */
  patternGradient: string;
  /** Glow color used for outer halo + border pulse */
  glowColor: string;
  glowRgb: string;
  /** Text colors */
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  /** Chip gradient */
  chipGradient: string;
  chipBorderColor: string;
  /** Hologram tint */
  hologramColor: string;
  /** Border gradient stops */
  borderFrom: string;
  borderVia: string;
  borderTo: string;
  /** QR code foreground */
  qrFg: string;
  /** Concept/tag lines */
  conceptCode: string;
  perks: string;
  /** Tier icon (emoji or unicode) */
  tierIcon: string;
};

const tierThemes: Record<MemberLevel, TierTheme> = {
  Silver: {
    label: "SILVER",
    className: "gmc--silver",
    badge: "CLASS · S",
    surfaceGradient:
      "linear-gradient(145deg, #1a1c22 0%, #20232b 30%, #181b22 60%, #1e2128 85%, #16181e 100%)",
    patternGradient:
      "repeating-linear-gradient(120deg, rgba(200,210,230,0.012) 0px, rgba(200,210,230,0.012) 1px, transparent 1px, transparent 12px)",
    glowColor: "rgba(190, 200, 220, 0.30)",
    glowRgb: "190, 200, 220",
    primaryText: "#e0e4ed",
    secondaryText: "#b0b6c8",
    mutedText: "#6b7185",
    chipGradient:
      "linear-gradient(140deg, #e8ecf4 0%, #aab0be 35%, #7a8090 65%, #5a6070 100%)",
    chipBorderColor: "rgba(255,255,255,0.35)",
    hologramColor: "rgba(210,218,235,0.12)",
    borderFrom: "rgba(200,210,230,0.35)",
    borderVia: "rgba(200,210,230,0.08)",
    borderTo: "rgba(200,210,230,0.25)",
    qrFg: "#2a2e38",
    conceptCode: "INDUSTRIAL · ACCESS",
    perks: "Earn 1x · Welcome reward · Promo umum",
    tierIcon: "◆",
  },
  Gold: {
    label: "GOLD",
    className: "gmc--gold",
    badge: "CLASS · G",
    surfaceGradient:
      "linear-gradient(150deg, #100d06 0%, #1a1408 28%, #0e0b05 55%, #151008 80%, #0c0a04 100%)",
    patternGradient:
      "repeating-linear-gradient(135deg, rgba(200,160,40,0.015) 0px, rgba(200,160,40,0.015) 1px, transparent 1px, transparent 14px)",
    glowColor: "rgba(220, 170, 50, 0.38)",
    glowRgb: "220, 170, 50",
    primaryText: "#f0d060",
    secondaryText: "#c8a030",
    mutedText: "#6a5020",
    chipGradient:
      "linear-gradient(140deg, #fff0b0 0%, #e0b838 30%, #b08818 60%, #806010 100%)",
    chipBorderColor: "rgba(255,220,100,0.45)",
    hologramColor: "rgba(220,170,50,0.14)",
    borderFrom: "rgba(255,200,60,0.50)",
    borderVia: "rgba(200,150,30,0.10)",
    borderTo: "rgba(255,180,40,0.40)",
    qrFg: "#1a1408",
    conceptCode: "ELITE · EXECUTIVE",
    perks: "Point 1.2x · Birthday reward · Priority promo",
    tierIcon: "★",
  },
  Platinum: {
    label: "PLATINUM",
    className: "gmc--platinum",
    badge: "CLASS · P",
    surfaceGradient:
      "linear-gradient(150deg, #060c18 0%, #0a1225 30%, #050a14 58%, #0c1428 82%, #06091a 100%)",
    patternGradient:
      "repeating-linear-gradient(130deg, rgba(80,160,240,0.015) 0px, rgba(80,160,240,0.015) 1px, transparent 1px, transparent 16px)",
    glowColor: "rgba(80, 170, 240, 0.38)",
    glowRgb: "80, 170, 240",
    primaryText: "#c8e4ff",
    secondaryText: "#6eaade",
    mutedText: "#2e5a8a",
    chipGradient:
      "linear-gradient(140deg, #dceeff 0%, #6eaade 30%, #3070a8 60%, #1a4070 100%)",
    chipBorderColor: "rgba(130,200,255,0.40)",
    hologramColor: "rgba(80,170,240,0.14)",
    borderFrom: "rgba(100,190,255,0.50)",
    borderVia: "rgba(60,140,220,0.10)",
    borderTo: "rgba(80,170,240,0.40)",
    qrFg: "#0a1225",
    conceptCode: "QUANTUM · PRESTIGE",
    perks: "Point 1.5x · Free monthly drink · Exclusive event",
    tierIcon: "◈",
  },
  Ultra: {
    label: "ULTRA",
    className: "gmc--ultra",
    badge: "CLASS · Ω",
    surfaceGradient:
      "linear-gradient(140deg, #08040f 0%, #0d0618 30%, #06030c 55%, #0a0514 78%, #050310 100%)",
    patternGradient:
      "repeating-linear-gradient(125deg, rgba(140,60,240,0.02) 0px, rgba(140,60,240,0.02) 1px, transparent 1px, transparent 12px)",
    glowColor: "rgba(150, 80, 255, 0.44)",
    glowRgb: "150, 80, 255",
    primaryText: "#cba0ff",
    secondaryText: "#9060d8",
    mutedText: "#4a2888",
    chipGradient:
      "linear-gradient(140deg, #e8d4ff 0%, #a070e8 30%, #6838b8 60%, #381880 100%)",
    chipBorderColor: "rgba(180,120,255,0.45)",
    hologramColor: "rgba(150,80,255,0.16)",
    borderFrom: "rgba(170,100,255,0.55)",
    borderVia: "rgba(120,50,220,0.12)",
    borderTo: "rgba(140,70,240,0.45)",
    qrFg: "#0d0618",
    conceptCode: "FORBIDDEN · PROTOTYPE",
    perks: "Point 2x · Prototype access · Owner privilege",
    tierIcon: "⬡",
  },
};

/* ── Helpers ── */

function formatSince(value?: string | Date | null) {
  if (!value) return "LIFETIME";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "LIFETIME";
  return date
    .toLocaleDateString("id-ID", { month: "short", year: "numeric" })
    .toUpperCase();
}

function formatMemberNumber(code: string) {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const padded = normalized.padEnd(16, "0").slice(0, 16);
  return padded.match(/.{1,4}/g)?.join(" ") ?? padded;
}

function formatPhone(phone?: string | null) {
  if (!phone) return "+62 ___ ____ ____";
  return phone.trim();
}

/* ── Sub-components ── */

function EmvChip({
  gradient,
  borderColor,
}: {
  gradient: string;
  borderColor: string;
}) {
  return (
    <div
      className="gmc__chip"
      style={
        {
          "--chip-gradient": gradient,
          "--chip-border": borderColor,
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="gmc__chip-lines">
        <span />
        <span />
        <span />
      </div>
      <div className="gmc__chip-center" />
    </div>
  );
}

function ContactlessIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="gmc__contactless"
    >
      <path d="M8.5 16.5a5 5 0 0 1 0-9" opacity="0.4" />
      <path d="M11 14.5a2.5 2.5 0 0 1 0-5" opacity="0.65" />
      <path d="M6 18.5a7.5 7.5 0 0 1 0-13" opacity="0.25" />
    </svg>
  );
}

function BarcodeStripes({ color }: { color: string }) {
  const widths = useMemo(
    () => [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 2, 3, 1, 2, 1, 1, 2],
    [],
  );

  return (
    <div className="gmc__barcode" aria-hidden>
      {widths.map((w, i) => (
        <span
          key={`${i}-${w}`}
          style={{
            width: `${w * 1.5}px`,
            background: i % 3 === 0 ? color : `${color}bb`,
          }}
        />
      ))}
    </div>
  );
}

function useQrCode(value: string, fg: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value || "GARAGE", {
      errorCorrectionLevel: "M",
      margin: 1,
      color: {
        dark: fg,
        light: "#ffffff00",
      },
      width: 256,
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, fg]);

  return dataUrl;
}

/* ── FRONT FACE ── */

function CardFront({
  data,
  theme,
}: {
  data: PremiumMembershipCardData;
  theme: TierTheme;
}) {
  const qrPayload = useMemo(
    () =>
      JSON.stringify({
        v: 1,
        id: data.memberId,
        tier: data.tier,
        n: data.name,
      }),
    [data.memberId, data.name, data.tier],
  );
  const qrUrl = useQrCode(qrPayload, theme.qrFg);

  return (
    <div
      className="gmc__face"
      style={
        {
          "--face-surface": theme.surfaceGradient,
          "--face-pattern": theme.patternGradient,
          "--face-glow-rgb": theme.glowRgb,
          "--face-border-from": theme.borderFrom,
          "--face-border-via": theme.borderVia,
          "--face-border-to": theme.borderTo,
        } as CSSProperties
      }
    >
      {/* Holographic rainbow foil overlay */}
      <div className="gmc__holo-foil" aria-hidden />
      {/* Noise/grain texture */}
      <div className="gmc__grain" aria-hidden />
      {/* Animated shine sweep */}
      <div className="gmc__shine" aria-hidden />

      {/* Content layer */}
      <div className="gmc__content">
        {/* ── Top bar: Brand + Tier ── */}
        <header className="gmc__header">
          <div className="gmc__brand">
            <div className="gmc__brand-logo" aria-hidden>
              <Image
                src="/garage-brand/logo-icon.png"
                alt=""
                width={28}
                height={28}
                sizes="28px"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="gmc__brand-text">
              <p
                className="gmc__brand-name"
                style={{ color: theme.primaryText }}
              >
                GARAGE
              </p>
              <p
                className="gmc__brand-sub"
                style={{ color: theme.mutedText }}
              >
                COFFEE · MOTOR
              </p>
            </div>
          </div>
          <div className="gmc__tier-block">
            <p
              className="gmc__tier-eyebrow"
              style={{ color: theme.mutedText }}
            >
              ACCESS TIER
            </p>
            <p
              className="gmc__tier-name"
              style={{ color: theme.primaryText }}
            >
              <span className="gmc__tier-icon">{theme.tierIcon}</span>{" "}
              {theme.label}
            </p>
            <p
              className="gmc__tier-badge"
              style={{ color: theme.secondaryText }}
            >
              {theme.badge}
            </p>
          </div>
        </header>

        {/* ── Middle: Chip + Contactless + QR ── */}
        <div className="gmc__middle">
          <div className="gmc__chip-row">
            <EmvChip
              gradient={theme.chipGradient}
              borderColor={theme.chipBorderColor}
            />
            <ContactlessIcon color={theme.secondaryText} />
          </div>
          {qrUrl ? (
            <div className="gmc__qr">
              <Image
                src={qrUrl}
                alt=""
                width={120}
                height={120}
                unoptimized
                className="h-full w-full"
              />
            </div>
          ) : (
            <div
              className="gmc__qr gmc__qr--placeholder"
              style={{ color: theme.mutedText }}
            >
              QR
            </div>
          )}
        </div>

        {/* ── Bottom: Number + Name + Valid ── */}
        <div className="gmc__bottom">
          <p
            className="gmc__number"
            style={{ color: theme.primaryText }}
          >
            {formatMemberNumber(data.memberId)}
          </p>

          <div className="gmc__info-row">
            <div className="gmc__info-col gmc__info-col--name">
              <span
                className="gmc__info-label"
                style={{ color: theme.mutedText }}
              >
                MEMBER
              </span>
              <span
                className="gmc__info-value gmc__info-value--name"
                style={{ color: theme.primaryText }}
                title={data.name}
              >
                {data.name || "GARAGE MEMBER"}
              </span>
            </div>
            <div className="gmc__info-col gmc__info-col--valid">
              <span
                className="gmc__info-label"
                style={{ color: theme.mutedText }}
              >
                VALID THRU
              </span>
              <span
                className="gmc__info-value"
                style={{ color: theme.primaryText }}
              >
                {data.validThru ?? formatSince(data.membershipSince)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── BACK FACE ── */

function CardBack({
  data,
  theme,
}: {
  data: PremiumMembershipCardData;
  theme: TierTheme;
}) {
  return (
    <div
      className="gmc__face"
      style={
        {
          "--face-surface": theme.surfaceGradient,
          "--face-pattern": theme.patternGradient,
          "--face-glow-rgb": theme.glowRgb,
          "--face-border-from": theme.borderFrom,
          "--face-border-via": theme.borderVia,
          "--face-border-to": theme.borderTo,
        } as CSSProperties
      }
    >
      <div className="gmc__holo-foil" aria-hidden />
      <div className="gmc__grain" aria-hidden />
      <div className="gmc__shine" aria-hidden />

      <div className="gmc__content gmc__content--back">
        {/* Magnetic stripe */}
        <div className="gmc__magstripe" aria-hidden />

        {/* Signature strip + CVV area */}
        <div className="gmc__sig-strip">
          <div className="gmc__sig-strip-inner">
            <span
              className="gmc__sig-label"
              style={{ color: theme.mutedText }}
            >
              AUTHORIZED SIGNATURE
            </span>
          </div>
          <div
            className="gmc__cvv-box"
            style={{ color: theme.secondaryText }}
          >
            <span className="gmc__cvv-label">CVV</span>
            <span className="gmc__cvv-dots">• • •</span>
          </div>
        </div>

        {/* Info section */}
        <div className="gmc__back-info">
          <div className="gmc__back-info-row">
            <div className="gmc__back-info-col">
              <span
                className="gmc__info-label"
                style={{ color: theme.mutedText }}
              >
                {theme.conceptCode}
              </span>
              <span
                className="gmc__back-protocol"
                style={{ color: theme.primaryText }}
              >
                {theme.label} PROTOCOL
              </span>
            </div>
            <div
              className="gmc__back-tier-chip"
              style={{
                borderColor: theme.borderFrom,
                color: theme.primaryText,
              }}
            >
              {theme.tierIcon} {theme.badge}
            </div>
          </div>

          <div className="gmc__back-details">
            <div className="gmc__back-detail-col">
              <span
                className="gmc__info-label"
                style={{ color: theme.mutedText }}
              >
                ALAMAT
              </span>
              <span
                className="gmc__back-detail-value"
                style={{ color: theme.primaryText }}
                title={data.address ?? ""}
              >
                {data.address || "Garage HQ · Medan, ID"}
              </span>
            </div>
            <div className="gmc__back-detail-col">
              <span
                className="gmc__info-label"
                style={{ color: theme.mutedText }}
              >
                KONTAK
              </span>
              <span
                className="gmc__back-phone"
                style={{ color: theme.primaryText }}
              >
                {formatPhone(data.phone)}
              </span>
            </div>
          </div>

          <BarcodeStripes color={theme.secondaryText} />
        </div>

        {/* Footer */}
        <div
          className="gmc__back-footer"
          style={{
            borderColor: `rgba(${theme.glowRgb}, 0.12)`,
            color: theme.mutedText,
          }}
        >
          <span>garage-motor.id</span>
          <span className="gmc__back-footer-code">
            {formatMemberNumber(data.memberId).replace(/ /g, "·")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ── */

export function PremiumMembershipCard({
  data,
  side = "front",
  flippable = false,
  interactive = true,
  className,
  ariaLabel,
}: PremiumMembershipCardProps) {
  const theme = tierThemes[data.tier] ?? tierThemes.Silver;
  const [internalFlipped, setInternalFlipped] = useState(side === "back");
  const flipped = flippable ? internalFlipped : side === "back";
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width - 0.5;
      const relY = (event.clientY - rect.top) / rect.height - 0.5;
      const rotY = relX * 18;
      const rotX = relY * -12;
      el.style.setProperty("--gmc-rot-y", `${rotY}deg`);
      el.style.setProperty("--gmc-rot-x", `${rotX}deg`);
      el.style.setProperty(
        "--gmc-shine-x",
        `${Math.round((relX + 0.5) * 100)}%`,
      );
      el.style.setProperty(
        "--gmc-shine-y",
        `${Math.round((relY + 0.5) * 100)}%`,
      );
    },
    [interactive],
  );

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--gmc-rot-y", "0deg");
    el.style.setProperty("--gmc-rot-x", "0deg");
    el.style.setProperty("--gmc-shine-x", "60%");
    el.style.setProperty("--gmc-shine-y", "30%");
  }, []);

  const handleClick = useCallback(() => {
    if (!flippable) return;
    setInternalFlipped((v) => !v);
  }, [flippable]);

  const style = useMemo<CSSProperties>(
    () =>
      ({
        "--gmc-glow": theme.glowColor,
        "--gmc-glow-rgb": theme.glowRgb,
        "--gmc-holo": theme.hologramColor,
      }) as CSSProperties,
    [theme],
  );

  return (
    <div
      ref={cardRef}
      className={`gmc ${theme.className} ${
        flippable ? "gmc--flippable" : ""
      } ${interactive ? "gmc--interactive" : ""} ${
        flipped ? "is-flipped" : ""
      } ${className ?? ""}`.trim()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role={flippable ? "button" : undefined}
      tabIndex={flippable ? 0 : undefined}
      aria-label={
        ariaLabel ??
        `Kartu membership ${theme.label} atas nama ${data.name || "member"}`
      }
      onKeyDown={
        flippable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setInternalFlipped((v) => !v);
              }
            }
          : undefined
      }
      style={style}
    >
      <div className="gmc__shell">
        <div className="gmc__side gmc__side--front">
          <CardFront data={data} theme={theme} />
        </div>
        <div className="gmc__side gmc__side--back">
          <CardBack data={data} theme={theme} />
        </div>
      </div>
    </div>
  );
}

export const PREMIUM_TIER_OPTIONS: Array<{
  tier: MemberLevel;
  label: string;
  tagline: string;
  perks: string;
}> = (Object.keys(tierThemes) as MemberLevel[]).map((tier) => ({
  tier,
  label: tierThemes[tier].label,
  tagline: tierThemes[tier].conceptCode,
  perks: tierThemes[tier].perks,
}));
