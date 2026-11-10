"use client";

// Garage Crystal V5 — komponen dasar bersama (order, pilih meja, menu, member, sidebar).
// Visual dari crystal.css; perilaku (data, aksi) selalu dari pemanggil — komponen ini tidak memuat data.
import "./crystal.css";

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type Div = HTMLAttributes<HTMLDivElement>;

export type CrystalVariant = "default" | "elevated" | "active" | "disabled" | "error" | "loading";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const CrystalCard = forwardRef<HTMLDivElement, Div & { variant?: CrystalVariant; selected?: boolean; interactive?: boolean; laser?: boolean }>(
  function CrystalCard({ variant = "default", selected, interactive, laser, className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cx("gc-glass", className)}
        data-variant={variant}
        data-selected={selected ? "true" : undefined}
        data-interactive={interactive ? "true" : undefined}
        aria-disabled={variant === "disabled" ? true : undefined}
        aria-busy={variant === "loading" ? true : undefined}
        {...rest}
      >
        {laser ? <LaserBorder /> : null}
        {children}
      </div>
    );
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "google" | "icon";
  loading?: boolean;
  icon?: ReactNode;
};

export const CrystalButton = forwardRef<HTMLButtonElement, ButtonProps>(function CrystalButton(
  { tone = "secondary", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("gc-btn", `gc-btn-${tone}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="gc-spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function CrystalChip({ active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" className={cx("gc-chip", className)} aria-pressed={active ?? undefined} {...rest} />;
}

export function CrystalBadge({ tone = "red", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "red" | "gold" | "neutral" }) {
  return <span className={cx("gc-badge", className)} data-tone={tone} {...rest} />;
}

/** Titik status bercahaya + label teks (status tidak pernah hanya warna). */
export function StatusDot({ color, label, className }: { color: string; label: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span className="gc-dot" style={{ color }} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function CrystalSkeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx("gc-skeleton", className)} style={style} aria-hidden />;
}

/** Bottom sheet sederhana (Escape / klik latar menutup). Fokus dipindah ke sheet saat dibuka. */
export function CrystalSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="gc-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="gc-sheet gc-scroll" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="gc-sheet-handle" aria-hidden />
        {children}
      </div>
    </>
  );
}

/**
 * Border laser merah mengelilingi kartu (SVG rect + pathLength; sudut rounded presisi).
 * Berhenti saat kartu tidak terlihat; diganti garis statis saat prefers-reduced-motion (CSS).
 * Induk harus `position: relative`.
 */
export function LaserBorder({ radius = 16, inset = 1 }: { radius?: number; inset?: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => setSize({ w: host.clientWidth, h: host.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(host);
    return () => {
      resize.disconnect();
      io.disconnect();
    };
  }, []);

  const w = Math.max(0, size.w - inset * 2);
  const h = Math.max(0, size.h - inset * 2);
  const r = Math.min(radius, w / 2, h / 2);
  return (
    <svg
      ref={ref}
      className="gc-laser"
      data-paused={visible ? undefined : "true"}
      viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      {w > 0 ? (
        <>
          <rect className="gc-laser-track" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
          <rect className="gc-laser-glow" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
          <rect className="gc-laser-core" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
        </>
      ) : null}
    </svg>
  );
}

/** Ikon dalam bingkai crystal (gaya papan Sidebar V3): ikon lucide + kotak kaca + glow merah saat aktif. */
export function CrystalIcon({ children, active, size = 44, className }: { children: ReactNode; active?: boolean; size?: number; className?: string }) {
  return (
    <span
      className={cx("gc-glass grid shrink-0 place-items-center", className)}
      data-variant={active ? "active" : "elevated"}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden
    >
      {children}
    </span>
  );
}
