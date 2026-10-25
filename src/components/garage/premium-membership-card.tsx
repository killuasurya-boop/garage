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
  type PointerEvent as ReactPointerEvent,
} from "react";
import QRCode from "qrcode";
import { Check, Crown, Gem, QrCode, RotateCcw, Shield, Sparkles, type LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MemberLevel } from "@/lib/member-types";
import {
  CARD_BRAND_LINE,
  CARD_TIER_LABEL,
  CARD_WEBSITE,
  cardMemberSince,
  cardPerks,
  cardTier,
  cardValidity,
  formatMemberCode,
  memberInitials,
  memberQrPayload,
  optionalCardText,
} from "@/lib/membership-card-model";
import "./premium-membership-card.css";

// Kartu member Garage Coffee (layar). Data kartu dari membership-card-model.ts —
// sama dengan unduhan PNG/JPG/PDF. Tidak ada elemen kartu bank palsu.

export type PremiumMembershipCardData = {
  name: string;
  memberId: string;
  phone?: string | null;
  address?: string | null;
  tier: MemberLevel;
  membershipSince?: string | Date | null;
  photoUrl?: string | null;
  /** Tanggal kedaluwarsa (ISO/Date) atau teks lama seperti "12/28". */
  validThru?: string | Date | null;
  points?: number | null;
};

export type PremiumMembershipCardProps = {
  data: PremiumMembershipCardData;
  side?: "front" | "back";
  /** Dipanggil saat kartu dibalik; bila diisi, `side` dikendalikan induk. */
  onSideChange?: (side: "front" | "back") => void;
  flippable?: boolean;
  interactive?: boolean;
  expired?: boolean;
  /** Tampilkan tombol "Tunjukkan QR" (layar besar untuk kasir). */
  showQrButton?: boolean;
  className?: string;
  ariaLabel?: string;
};

type TierTheme = {
  className: string;
  icon: LucideIcon;
  surface: string;
  pattern: string;
  glowRgb: string;
  text: string;
  soft: string;
  muted: string;
  accent: string;
  border: string;
};

const tierThemes: Record<MemberLevel, TierTheme> = {
  Silver: {
    className: "gmc--silver",
    icon: Shield,
    surface: "linear-gradient(145deg, #23262e 0%, #1b1e25 38%, #262a33 70%, #191b21 100%)",
    pattern:
      "repeating-linear-gradient(120deg, rgba(210,218,235,0.035) 0 1px, transparent 1px 12px)",
    glowRgb: "200 208 225",
    text: "#eef1f7",
    soft: "#c9cfdc",
    muted: "#a3aabb",
    accent: "#d9deea",
    border: "rgba(210, 218, 235, 0.38)",
  },
  Gold: {
    className: "gmc--gold",
    icon: Crown,
    surface: "linear-gradient(150deg, #1d1609 0%, #2a1f0b 34%, #171107 62%, #241a0a 100%)",
    pattern:
      "repeating-linear-gradient(135deg, rgba(230,185,70,0.04) 0 1px, transparent 1px 14px)",
    glowRgb: "230 180 60",
    text: "#fbe7a6",
    soft: "#e9c862",
    muted: "#c9a85a",
    accent: "#f2c94c",
    border: "rgba(242, 201, 76, 0.5)",
  },
  Platinum: {
    className: "gmc--platinum",
    icon: Gem,
    surface: "linear-gradient(150deg, #0b1424 0%, #102038 34%, #0a1220 62%, #12233d 100%)",
    pattern:
      "repeating-linear-gradient(130deg, rgba(110,180,245,0.045) 0 1px, transparent 1px 16px)",
    glowRgb: "90 175 245",
    text: "#e1f0ff",
    soft: "#a9d2f7",
    muted: "#8cb4d9",
    accent: "#7cc0ff",
    border: "rgba(124, 192, 255, 0.5)",
  },
  Ultra: {
    className: "gmc--ultra",
    icon: Sparkles,
    surface: "linear-gradient(140deg, #140a24 0%, #1d0f36 34%, #110820 62%, #21103d 100%)",
    pattern:
      "repeating-linear-gradient(125deg, rgba(165,105,255,0.05) 0 1px, transparent 1px 12px)",
    glowRgb: "160 95 255",
    text: "#efe4ff",
    soft: "#cfb4ff",
    muted: "#b29ad9",
    accent: "#b98aff",
    border: "rgba(185, 138, 255, 0.55)",
  },
};

// QR selalu modul gelap di atas plate putih solid agar terbaca scanner kasir.
const QR_DARK = "#0d1018";

function useQrDataUrl(payload: string, width: number) {
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: "", url: null });
  const key = `${width}:${payload}`;
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width,
      color: { dark: QR_DARK, light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setState({ key, url });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, width, key]);
  return state.key === key ? state.url : null;
}

function QrPlate({ url, label }: { url: string | null; label: string }) {
  return (
    <span className="gmc__qr-plate">
      {url ? (
        <Image src={url} alt={label} width={256} height={256} unoptimized className="gmc__qr-img" />
      ) : (
        <span className="gmc__qr-loading" aria-hidden />
      )}
    </span>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="gmc__field">
      <span className="gmc__label">{label}</span>
      <span className={`gmc__value ${mono ? "gmc__value--mono" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function CardFront({
  data,
  theme,
  qrUrl,
  expired,
  onQr,
}: {
  data: PremiumMembershipCardData;
  theme: TierTheme;
  qrUrl: string | null;
  expired: boolean;
  onQr?: () => void;
}) {
  const tier = cardTier(data.tier);
  const TierIcon = theme.icon;
  const validity = cardValidity({ validThru: data.validThru });
  const since = cardMemberSince(data.membershipSince);
  const code = formatMemberCode(data.memberId);
  const qrLabel = `QR member ${code}`;

  return (
    <div className="gmc__face">
      <div className="gmc__pattern" aria-hidden />
      <div className="gmc__holo" aria-hidden />
      <div className="gmc__shine" aria-hidden />
      {expired ? <span className="gmc__ribbon">Expired</span> : null}

      <div className="gmc__content gmc__content--front">
        <header className="gmc__header">
          <div className="gmc__brand">
            <span className="gmc__brand-logo" aria-hidden>
              <Image src="/garage-brand/garage-coffee-icon.png" alt="" width={40} height={40} sizes="40px" />
            </span>
            <span className="min-w-0">
              <span className="gmc__brand-name">GARAGE</span>
              <span className="gmc__brand-sub">{CARD_BRAND_LINE}</span>
            </span>
          </div>
          <div className="gmc__tier">
            <span className="gmc__label">Member tier</span>
            <span className="gmc__tier-name">
              <TierIcon className="gmc__tier-icon" aria-hidden />
              {CARD_TIER_LABEL[tier]}
            </span>
          </div>
        </header>

        <div className="gmc__main">
          <div className="gmc__identity">
            <span className="gmc__avatar" aria-hidden>
              {data.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL foto member dinamis (upload/data URL)
                <img src={data.photoUrl} alt="" />
              ) : (
                <span>{memberInitials(data.name)}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="gmc__name" title={data.name}>
                {data.name || "Member Garage"}
              </span>
              <span className="gmc__code">{code}</span>
            </span>
          </div>
          {onQr ? (
            <button
              type="button"
              className="gmc__qr"
              onClick={(event) => {
                event.stopPropagation();
                onQr();
              }}
              aria-label="Tunjukkan QR member ke kasir"
            >
              <QrPlate url={qrUrl} label={qrLabel} />
            </button>
          ) : (
            <span className="gmc__qr">
              <QrPlate url={qrUrl} label={qrLabel} />
            </span>
          )}
        </div>

        <footer className="gmc__footer">
          <Field label="Member sejak" value={since ?? "—"} />
          <Field label={validity.label} value={expired ? "EXPIRED" : validity.value} />
        </footer>
      </div>
    </div>
  );
}

function CardBack({
  data,
  theme,
  qrUrl,
}: {
  data: PremiumMembershipCardData;
  theme: TierTheme;
  qrUrl: string | null;
}) {
  const tier = cardTier(data.tier);
  const TierIcon = theme.icon;
  const { perks } = cardPerks(tier);
  const validity = cardValidity({ validThru: data.validThru });
  const phone = optionalCardText(data.phone, 24);
  const address = optionalCardText(data.address, 70);
  const code = formatMemberCode(data.memberId);
  const points = typeof data.points === "number" && Number.isFinite(data.points) ? data.points : null;

  return (
    <div className="gmc__face">
      <div className="gmc__pattern" aria-hidden />
      <div className="gmc__holo" aria-hidden />
      <div className="gmc__shine" aria-hidden />

      <div className="gmc__content gmc__content--back">
        <div className="gmc__back-top">
          <div className="min-w-0">
            <span className="gmc__label">Benefit</span>
            <span className="gmc__tier-name gmc__tier-name--left">
              <TierIcon className="gmc__tier-icon" aria-hidden />
              {CARD_TIER_LABEL[tier]}
            </span>
            <ul className="gmc__perks">
              {perks.slice(0, 3).map((perk) => (
                <li key={perk}>
                  <Check className="gmc__perk-icon" aria-hidden />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </div>
          <span className="gmc__qr gmc__qr--back">
            <QrPlate url={qrUrl} label={`QR member ${code}`} />
          </span>
        </div>

        <div className="gmc__back-grid">
          {points !== null ? (
            <Field label="Poin" value={new Intl.NumberFormat("id-ID").format(points)} />
          ) : null}
          <Field label={validity.label} value={validity.value} />
          {phone ? <Field label="Kontak" value={phone} mono /> : null}
          {address && (points === null || !phone) ? <Field label="Alamat" value={address} /> : null}
        </div>

        <footer className="gmc__back-footer">
          <span>{CARD_WEBSITE}</span>
          <span className="gmc__value--mono">{code}</span>
        </footer>
      </div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function PremiumMembershipCard({
  data,
  side = "front",
  onSideChange,
  flippable = false,
  interactive = true,
  expired = false,
  showQrButton = true,
  className,
  ariaLabel,
}: PremiumMembershipCardProps) {
  const tier = cardTier(data.tier);
  const theme = tierThemes[tier];
  const controlled = Boolean(onSideChange);
  const [internalSide, setInternalSide] = useState(side);
  const [prevSide, setPrevSide] = useState(side);
  if (side !== prevSide) {
    // Ikuti perubahan `side` dari induk (tombol Lihat depan/belakang).
    setPrevSide(side);
    setInternalSide(side);
  }
  const currentSide = controlled || !flippable ? side : internalSide;
  const flipped = currentSide === "back";
  const [hasFlipped, setHasFlipped] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const qrPayload = useMemo(
    () => memberQrPayload({ memberCode: data.memberId, tier, name: data.name }),
    [data.memberId, data.name, tier],
  );
  const cardQrUrl = useQrDataUrl(qrPayload, 256);
  const bigQrUrl = useQrDataUrl(qrPayload, 560);
  const tiltEnabled = interactive && !reducedMotion && !qrOpen;

  const setTilt = useCallback((rx: number, ry: number, mx: number, my: number, active: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--gmc-rx", `${rx}deg`);
    el.style.setProperty("--gmc-ry", `${ry}deg`);
    el.style.setProperty("--gmc-mx", `${mx}%`);
    el.style.setProperty("--gmc-my", `${my}%`);
    el.classList.toggle("is-tilting", active);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!tiltEnabled) return;
      // Sentuh: miring hanya saat jari menempel/geser.
      if (event.pointerType !== "mouse" && event.buttons === 0) return;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
      const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setTilt((0.5 - y) * 14, (x - 0.5) * 20, Math.round(x * 100), Math.round(y * 100), true);
      });
    },
    [setTilt, tiltEnabled],
  );

  const resetTilt = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setTilt(0, 0, 60, 30, false);
  }, [setTilt]);

  useEffect(() => {
    if (!tiltEnabled) resetTilt();
  }, [tiltEnabled, resetTilt]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const flip = useCallback(() => {
    if (!flippable) return;
    const next = flipped ? "front" : "back";
    setHasFlipped(true);
    if (controlled) onSideChange?.(next);
    else setInternalSide(next);
  }, [controlled, flippable, flipped, onSideChange]);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      // Geser jari untuk memiringkan kartu tidak dihitung sebagai tap balik.
      const start = pointerStart.current;
      pointerStart.current = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      flip();
    },
    [flip],
  );

  const style = useMemo(
    () =>
      ({
        "--gmc-glow-rgb": theme.glowRgb,
        "--gmc-surface": theme.surface,
        "--gmc-pattern": theme.pattern,
        "--gmc-text": theme.text,
        "--gmc-soft": theme.soft,
        "--gmc-muted": theme.muted,
        "--gmc-accent": theme.accent,
        "--gmc-border": theme.border,
      }) as CSSProperties,
    [theme],
  );

  const code = formatMemberCode(data.memberId);
  const label = ariaLabel ?? `Kartu member ${CARD_TIER_LABEL[tier]} atas nama ${data.name || "member"}, kode ${code}`;
  const openQr = showQrButton ? () => setQrOpen(true) : undefined;

  return (
    <div className={`gmc-wrap ${className ?? ""}`.trim()}>
      <div
        ref={cardRef}
        className={[
          "gmc",
          theme.className,
          flippable ? "gmc--flippable" : "",
          interactive ? "gmc--interactive" : "",
          flipped ? "is-flipped" : "",
          hasFlipped ? "has-flipped" : "",
          expired ? "is-expired" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="group"
        aria-roledescription="kartu member"
        aria-label={label}
        style={style}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") resetTilt();
        }}
        onPointerCancel={resetTilt}
        onClick={flippable ? handleClick : undefined}
      >
        <span className="gmc__glow" aria-hidden />
        <div className="gmc__lift">
          <div className="gmc__shell">
            <div className="gmc__side gmc__side--front" aria-hidden={flipped}>
              <CardFront data={data} theme={theme} qrUrl={cardQrUrl} expired={expired} onQr={flipped ? undefined : openQr} />
            </div>
            <div className="gmc__side gmc__side--back" aria-hidden={!flipped}>
              <CardBack data={data} theme={theme} qrUrl={cardQrUrl} />
            </div>
          </div>
        </div>
      </div>

      {showQrButton || (flippable && !controlled) ? (
        <div className="gmc-actions">
          {showQrButton ? (
            <button type="button" className="gmc-action gmc-action--primary" onClick={() => setQrOpen(true)}>
              <QrCode size={16} aria-hidden />
              <span>Tunjukkan QR ke kasir</span>
            </button>
          ) : null}
          {flippable && !controlled ? (
            <button type="button" className="gmc-action" onClick={flip} aria-pressed={flipped}>
              <RotateCcw size={16} aria-hidden />
              <span>{flipped ? "Lihat depan" : "Lihat belakang"}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {showQrButton ? (
        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="gmc-qr-dialog">
            <DialogTitle className="gmc-qr-dialog__title">QR Member</DialogTitle>
            <DialogDescription className="gmc-qr-dialog__desc">
              Tunjukkan ke kasir untuk dipindai. Naikkan kecerahan layar bila perlu.
            </DialogDescription>
            <div className="gmc-qr-dialog__plate">
              {bigQrUrl ? (
                <Image src={bigQrUrl} alt={`QR member ${code}`} width={560} height={560} unoptimized />
              ) : (
                <span className="gmc__qr-loading" aria-hidden />
              )}
            </div>
            <div className="gmc-qr-dialog__meta">
              <span className="gmc-qr-dialog__name">{data.name || "Member Garage"}</span>
              <span className="gmc-qr-dialog__code">{code}</span>
              <span className="gmc-qr-dialog__tier">{CARD_TIER_LABEL[tier]}</span>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

export const PREMIUM_TIER_OPTIONS: Array<{
  tier: MemberLevel;
  label: string;
  perks: string;
}> = (Object.keys(tierThemes) as MemberLevel[]).map((tier) => ({
  tier,
  label: CARD_TIER_LABEL[tier],
  perks: cardPerks(tier).perks.join(" · "),
}));
