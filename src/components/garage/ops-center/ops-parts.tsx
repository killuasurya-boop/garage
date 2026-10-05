"use client";

// Komponen presentasi Garage Control Center. Status selalu disertai teks/ikon
// (tidak hanya warna); palet Garage: asphalt, silver, merah, amber.

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Flame, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { OpsSeverity, OpsStatusLevel } from "@/lib/ops-center-engine";

/** Menit (desimal) → "m:ss". */
export function fmtClock(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.max(0, Math.floor(minutes * 60));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function elapsedMin(fromIso: string, now: number) {
  return Math.max(0, (now - new Date(fromIso).getTime()) / 60000);
}

export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

export const STATUS_STYLE: Record<OpsStatusLevel, { box: string; dot: string; icon: LucideIcon }> = {
  normal: { box: "border-[#4a4a54] bg-white/[0.05] text-[#e4e4e7]", dot: "bg-[#d4d4d8]", icon: CheckCircle2 },
  busy: { box: "border-[#f5a742]/60 bg-[#f5a742]/12 text-[#ffd79a]", dot: "bg-[#f5a742]", icon: AlertTriangle },
  rush: { box: "border-[#d11a2a]/70 bg-[#d11a2a]/18 text-[#ffc2c8]", dot: "bg-[#ff2a3a]", icon: Flame },
  critical: {
    box: "border-[#ff2a3a] bg-[#8b0f1a]/45 text-white shadow-[0_0_24px_rgba(255,42,58,0.35)]",
    dot: "bg-[#ff2a3a] motion-safe:animate-pulse",
    icon: OctagonAlert,
  },
};

export const SEVERITY_STYLE: Record<OpsSeverity, { box: string; label: string; icon: LucideIcon }> = {
  critical: { box: "border-[#d11a2a]/70 bg-[#2a1116]", label: "KRITIS", icon: OctagonAlert },
  warning: { box: "border-[#f5a742]/50 bg-[#f5a742]/[0.07]", label: "PERHATIAN", icon: AlertTriangle },
  info: { box: "border-[#34343c] bg-[#16161b]", label: "INFO", icon: Info },
};

export function Panel({
  title,
  icon: Icon,
  right,
  children,
  className = "",
}: {
  title: string;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-[#34343c] bg-[#131318] p-3 sm:p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.14em] text-[#d4d4d8]">
          {Icon ? <Icon className="size-4 text-[#f5a742]" aria-hidden /> : null}
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "amber" | "red" | "silver";
}) {
  const toneClass =
    tone === "red"
      ? "text-[#ff6b78]"
      : tone === "amber"
        ? "text-[#ffd79a]"
        : tone === "silver"
          ? "text-[#e4e4e7]"
          : "text-white";
  return (
    <div className="min-w-0 rounded-lg border border-[#34343c] bg-[#16161b] px-3 py-2.5">
      <p className="break-words font-mono text-[11px] font-bold uppercase leading-tight tracking-[0.1em] text-[#a8a8b2]">{label}</p>
      <p className={`mt-0.5 font-mono text-3xl font-black tabular-nums leading-tight ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs leading-snug text-[#b8b8c2]">{sub}</p> : null}
    </div>
  );
}

/** Bar beban 0–100+% dengan label teks. */
export function LoadBar({ label, pct, level, detail }: { label: string; pct: number; level: string; detail?: string }) {
  const width = Math.min(100, Math.max(2, pct));
  const color = pct >= 90 ? "bg-[#ff2a3a]" : pct >= 70 ? "bg-[#f5a742]" : "bg-[#d4d4d8]";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-black text-white">{label}</span>
        <span className="font-mono text-sm font-black tabular-nums text-white">
          {pct}% <span className="text-xs font-bold text-[#b8b8c2]">{level}</span>
        </span>
      </div>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.08]"
        role="meter"
        aria-label={`Beban ${label}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${color} motion-safe:transition-[width] motion-safe:duration-500`} style={{ width: `${width}%` }} />
      </div>
      {detail ? <p className="mt-1 text-xs text-[#a8a8b2]">{detail}</p> : null}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "red" }) {
  const cls =
    tone === "red"
      ? "border-[#d11a2a]/70 bg-[#d11a2a]/18 text-[#ffc2c8]"
      : tone === "amber"
        ? "border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffd79a]"
        : "border-[#4a4a54] bg-white/[0.05] text-[#e4e4e7]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-black uppercase ${cls}`}>
      {children}
    </span>
  );
}

/** Perubahan tren dengan arah & arti ("lebih cepat"/"lebih lambat"). */
export function TrendText({ change, lowerIsBetter = true, suffix = "%" }: { change: number | null; lowerIsBetter?: boolean; suffix?: string }) {
  if (change == null) return <span className="text-[#a8a8b2]">Data pembanding belum cukup</span>;
  if (change === 0) return <span className="text-[#d4d4d8]">Stabil</span>;
  const better = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span className={better ? "font-bold text-[#e4e4e7]" : "font-bold text-[#ffb3b3]"}>
      {change > 0 ? "▲" : "▼"} {Math.abs(change)}
      {suffix} · {better ? "membaik" : "memburuk"}
    </span>
  );
}
