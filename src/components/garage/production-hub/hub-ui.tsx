"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChefHat, Coffee, X, type LucideIcon } from "lucide-react";

import type { HubStatus, SlaLevel } from "@/lib/production-hub-v4";

// Primitif UI Production Hub V4 (scope .phv4). Overlay = laci kanan di tablet/
// desktop, lembar bawah di HP; Esc / ketuk latar menutup; fokus masuk panel.

export function HubSheet({
  open,
  onClose,
  title,
  icon: Icon,
  children,
  width = "md:w-[min(560px,100vw)]",
  footer,
  variant = "drawer",
  modal = true,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  /** "modal" = di tengah layar pada tablet/desktop (popup detail); HP tetap lembar bawah. */
  variant?: "drawer" | "modal";
  /**
   * V7 panel detail: false = di tablet/desktop laci TIDAK menutup antrean (tanpa latar gelap, kartu lain tetap bisa
   * diketuk untuk mengganti isi panel). Di HP tetap lembar penuh dengan latar.
   */
  modal?: boolean;
  /** Lembar HP hampir setinggi layar (detail pesanan). */
  tall?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Hanya saat dibuka/ditutup (bukan tiap render — layar re-render tiap detik untuk timer):
  // fokus masuk panel sekali, kembali ke pemicu saat ditutup.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-[48] flex items-end ${variant === "modal" ? "justify-center md:items-center md:p-6" : "justify-end md:items-stretch"} ${modal ? "" : "md:pointer-events-none"}`}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Tutup"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 ${modal ? "" : "md:hidden"}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal ? "true" : undefined}
        aria-label={title}
        tabIndex={-1}
        className={`phv4-sheet-in ${variant === "drawer" ? "phv7-drawer" : ""} pointer-events-auto relative flex w-full flex-col rounded-t-[10px] border border-[var(--phv4-border)] bg-[var(--phv4-bg2)] pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none ${tall ? "h-[94svh] max-h-[94svh] md:h-auto" : "max-h-[88svh]"} ${
          variant === "modal" ? "md:max-h-[86svh] md:rounded-[10px]" : "md:max-h-none md:rounded-none md:border-y-0 md:border-r-0"
        } ${width}`}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--phv4-border)] px-3">
          {Icon ? <Icon className="size-4 text-[var(--phv4-red)]" aria-hidden /> : null}
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid size-11 place-items-center rounded-md text-[var(--phv4-muted)] hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="garage-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
        {footer ? <div className="shrink-0 border-t border-[var(--phv4-border)] p-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export const STATUS_TONE: Record<HubStatus, { text: string; bg: string; bar: string }> = {
  waiting: { text: "text-[#1a1203]", bg: "bg-[var(--phv4-wait)]", bar: "border-l-[var(--phv4-wait)]" },
  processing: { text: "text-[#04222f]", bg: "bg-[var(--phv4-process)]", bar: "border-l-[var(--phv4-process)]" },
  ready: { text: "text-[#052e16]", bg: "bg-[var(--phv4-success)]", bar: "border-l-[var(--phv4-success)]" },
  delivering: { text: "text-[#052e16]", bg: "bg-[#86efac]", bar: "border-l-[#86efac]" },
  done: { text: "text-white", bg: "bg-[#4b5563]", bar: "border-l-[#4b5563]" },
};

export function StatusChip({ status, label }: { status: HubStatus; label: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-[12px] font-bold ${tone.bg} ${tone.text}`}>
      {label}
    </span>
  );
}

export function StationBadge({
  station,
  compact = false,
  responsive = false,
}: {
  station: "Bar" | "Food";
  compact?: boolean;
  /** Di dalam @container kartu: label disembunyikan bila kartu sempit. */
  responsive?: boolean;
}) {
  const Icon = station === "Bar" ? Coffee : ChefHat;
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] border border-[var(--phv4-border)] px-1.5 text-[12px] font-semibold text-[#d1d5db]">
      <Icon className="size-3" aria-hidden />
      {/* Kartu sempit (container < 270px): ikon saja, supaya meja & timer tidak terpotong. */}
      {compact ? null : <span className={responsive ? "hidden @[270px]:inline" : undefined}>{station === "Bar" ? "BAR" : "DAPUR"}</span>}
    </span>
  );
}

export const SLA_TEXT: Record<SlaLevel, string> = {
  ok: "text-[#d1d5db]",
  warn: "text-[var(--phv4-wait)]",
  critical: "text-[var(--phv4-critical)]",
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-8 shrink-0 items-center rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`h-full whitespace-nowrap rounded-[5px] px-2.5 text-[12px] font-semibold transition-colors ${
            value === option.value ? "bg-[var(--phv4-elev)] text-white" : "text-[var(--phv4-muted)] hover:text-white"
          }`}
        >
          {option.label}
          {option.count != null ? <span className="phv4-mono ml-1 text-[12px] opacity-80">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SelectBox<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <label className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--phv4-border)] bg-[var(--phv4-bg)] pl-2.5 text-[12px] text-[var(--phv4-muted)] ${className}`}>
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-full min-w-0 cursor-pointer rounded-md bg-transparent pr-1.5 text-[12px] font-semibold text-white outline-none [&>option]:bg-[#15171b]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
