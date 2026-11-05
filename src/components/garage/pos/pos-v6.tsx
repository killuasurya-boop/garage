"use client";

// =============================================================================
// Garage OS POS V6 (owner, Nov 2026) — komponen presentasi bersama.
// Referensi visual: 8 Component Design Board POS V6 (sidebar, topbar, katalog,
// keranjang, pembayaran, operasional, shift, Theme Studio).
// Aturan: komponen ini HANYA tampilan. Semua aksi (bayar, shift, keranjang, meja)
// tetap memanggil handler yang sudah ada di pos-view.tsx — tidak ada logika
// transaksi kedua. Warna dari token --pos-* (globals.css, per tema).
// =============================================================================
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Image from "next/image";
import { Check, Crown, Heart, ImageOff, Plus, Star, TicketPercent } from "lucide-react";

import { cashierThemePresets, type CashierThemeMode } from "../garage-app-pickers";

import "./pos-v6.css";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Tema dengan header/sidebar terang → pakai logo di pelat gelap (aturan logo CLAUDE.md). */
export function posV6ChromeIsLight(theme: CashierThemeMode) {
  return theme === "garage-clear" || theme === "focus-blue";
}

export function PosV6Brand({
  theme,
  compact = false,
  subtitle = "Point of Sale System",
  hideLogoAtXl = false,
}: {
  theme: CashierThemeMode;
  compact?: boolean;
  subtitle?: string;
  /** Topbar kiosk: logo sudah tampil di sidebar (≥ xl), jangan dobel. */
  hideLogoAtXl?: boolean;
}) {
  const light = posV6ChromeIsLight(theme);
  return (
    <div className="pos-v6-brand flex min-w-0 items-center gap-3">
      <span className={`pos-v6-logo shrink-0 ${light ? "pos-v6-logo-plate" : ""} ${hideLogoAtXl ? "xl:hidden" : ""}`}>
        <Image
          src={light ? "/garage-brand/garage-coffee-logo-dark.png" : "/garage-brand/garage-coffee-logo.png"}
          alt="Garage Coffee"
          width={1200}
          height={282}
          priority
          className="h-auto w-[112px] object-contain xl:w-[128px]"
        />
      </span>
      {compact ? null : (
        <span className={`pos-v6-brand-title hidden min-w-0 md:block ${hideLogoAtXl ? "border-l pl-3 xl:border-l-0 xl:pl-0" : "border-l pl-3"}`}>
          <span className="flex items-center gap-2">
            <span className="truncate text-[17px] font-extrabold leading-tight xl:text-lg">Garage OS POS V6</span>
            <span className="pos-v6-version">V6</span>
          </span>
          <span className="block truncate text-xs tracking-wide opacity-80">{subtitle}</span>
        </span>
      )}
    </div>
  );
}

const dayFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

/** Jam real-time (WIB). Dirender setelah mount supaya SSR/hidrasi tidak bentrok. */
export function PosV6Clock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="pos-v6-clock flex min-w-0 flex-col leading-tight" aria-live="off">
      {compact ? null : <span className="truncate text-[11px] font-semibold opacity-80">{now ? dayFmt.format(now) : "—"}</span>}
      <span className="font-mono text-lg font-bold tabular-nums">{now ? timeFmt.format(now).replace(".", ":") : "--:--"}</span>
    </span>
  );
}

export function PosV6ShiftChip({ open, cashier }: { open: boolean; cashier: string }) {
  return (
    <span className="pos-v6-shift flex min-w-0 items-center gap-2" data-open={open}>
      <span className="pos-v6-shift-dot size-2.5 shrink-0 rounded-full" aria-hidden />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-bold">{open ? "Shift Aktif" : "Shift Tidak Aktif"}</span>
        <span className="block truncate text-[11px] opacity-80">Kasir: {cashier}</span>
      </span>
    </span>
  );
}

/** Ringkasan KPI kecil di topbar (hanya data yang boleh dilihat peran ini). */
export function PosV6Kpi({ icon: Icon, label, value }: { icon: IconType; label: string; value: ReactNode }) {
  return (
    <span className="pos-v6-kpi flex min-w-0 items-center gap-2">
      <Icon className="size-5 shrink-0 opacity-85" aria-hidden />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] opacity-80">{label}</span>
        <span className="block truncate font-mono text-base font-bold tabular-nums">{value}</span>
      </span>
    </span>
  );
}

export function PosV6NavItem({
  icon: Icon,
  label,
  onClick,
  active = false,
  count,
  dot,
  shortcut,
  tone,
  disabled,
  testId,
}: {
  icon: IconType;
  label: string;
  onClick?: () => void;
  active?: boolean;
  /** Badge angka (mis. pesanan menunggu). 0 = tidak tampil. */
  count?: number;
  /** Titik status (mis. produksi aktif). */
  dot?: "good" | "warn" | "danger";
  shortcut?: string;
  tone?: "danger" | "accent";
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="pos-v6-nav-item"
      data-active={active}
      data-tone={tone}
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      data-testid={testId}
    >
      <Icon className="pos-v6-nav-icon size-5 shrink-0" aria-hidden />
      <span className="pos-v6-nav-label min-w-0 flex-1 truncate text-left">{label}</span>
      {count ? <span className="pos-v6-nav-count">{count > 99 ? "99+" : count}</span> : null}
      {dot ? <span className="pos-v6-nav-dot" data-dot={dot} aria-hidden /> : null}
      {shortcut ? <kbd className="pos-v6-nav-kbd">{shortcut}</kbd> : null}
    </button>
  );
}

export function PosV6NavGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="pos-v6-nav-group" role="group" aria-label={label}>
      {label ? <p className="pos-v6-nav-group-label">{label}</p> : null}
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

/** "Mode Tampilan" di sidebar: 4 lingkaran tema + buka Theme Studio. */
export function PosV6ThemeSwatches({ value, onChange, onOpenStudio, compact = false }: { value: CashierThemeMode; onChange: (theme: CashierThemeMode) => void; onOpenStudio?: () => void; compact?: boolean }) {
  return (
    <div className="pos-v6-mode">
      {compact ? null : (
        <button type="button" className="pos-v6-mode-title" onClick={onOpenStudio} title="Buka Theme Studio">
          Mode Tampilan
        </button>
      )}
      <div className={`flex ${compact ? "flex-col" : ""} items-center gap-2`} role="radiogroup" aria-label="Tema POS">
        {cashierThemePresets.map((preset) => {
          const active = preset.value === value;
          const [chrome, , , accent] = preset.swatches;
          return (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Tema ${preset.label}`}
              title={preset.label}
              className="pos-v6-swatch"
              data-active={active}
              style={{ background: `linear-gradient(135deg, ${chrome} 0 50%, ${accent} 50% 100%)` }}
              onClick={() => onChange(preset.value)}
            >
              {active ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PosV6CategoryTile({ icon: Icon, label, active, onClick, count }: { icon: IconType; label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button type="button" className="pos-v6-cat" data-active={active} aria-pressed={active} onClick={onClick}>
      <Icon className="size-[22px]" aria-hidden />
      <span className="truncate">{label}</span>
      {count ? <span className="sr-only">{count} produk</span> : null}
    </button>
  );
}

export type PosV6CardBadge = "signature" | "unggulan" | "promo" | null;

/**
 * Kartu produk V6 (papan 03). Satu komponen untuk semua kategori; perbedaan hanya dari data.
 * Tombol utama = seluruh kartu (sama seperti sebelumnya: handleProductTap). Tombol "+" visual.
 */
export function PosV6ProductCard({
  name,
  subtitle,
  price,
  strikePrice,
  imageUrl,
  fallbackIcon: FallbackIcon,
  soldOut,
  shortcode,
  badge,
  favorite,
  showPhoto,
  onTap,
  view,
}: {
  name: string;
  subtitle: string;
  price: string;
  strikePrice?: string | null;
  imageUrl?: string | null;
  fallbackIcon: IconType;
  soldOut: boolean;
  shortcode?: string | null;
  badge: PosV6CardBadge;
  favorite?: boolean;
  showPhoto: boolean;
  onTap: () => void;
  view: "visual" | "compact" | "list";
}) {
  const photo = showPhoto ? (
    <span className="pos-v6-card-photo" aria-hidden>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto menu dari storage (ukuran bebas)
        <img src={imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="pos-v6-card-fallback">
          <FallbackIcon className="size-7" aria-hidden />
          <ImageOff className="sr-only" aria-hidden />
        </span>
      )}
      {soldOut ? <span className="pos-v6-card-soldout">Habis</span> : null}
    </span>
  ) : null;

  return (
    <button
      type="button"
      className="pos-v6-card"
      data-view={view}
      data-sold-out={soldOut}
      data-photo={showPhoto}
      onClick={onTap}
      aria-disabled={soldOut}
      aria-label={soldOut ? `${name} sedang habis` : `Pesan ${name}`}
    >
      {photo}
      {badge ? (
        <span className="pos-v6-ribbon" data-badge={badge}>
          {badge === "signature" ? (
            <>Signature</>
          ) : badge === "unggulan" ? (
            <>
              <Crown className="size-3.5" aria-hidden /> Unggulan
            </>
          ) : (
            <>
              <TicketPercent className="size-3.5" aria-hidden /> Promo
            </>
          )}
        </span>
      ) : null}
      {favorite ? (
        <span className="pos-v6-fav" title="Sering dipesan di perangkat ini" aria-hidden>
          <Heart className="size-4" fill="currentColor" />
        </span>
      ) : null}
      <span className="pos-v6-card-body">
        <span className="pos-v6-card-name">{name}</span>
        <span className="pos-v6-card-sub">
          {shortcode ? (
            <span className="pos-v6-code" title={`Kode singkat: ketik "${shortcode}" di pencarian`} data-testid="pos-product-shortcode">
              {shortcode}
            </span>
          ) : null}
          <span className="truncate">{subtitle}</span>
        </span>
        <span className="pos-v6-card-foot">
          <span className="min-w-0">
            <span className="pos-v6-card-price">{price}</span>
            {strikePrice ? <span className="pos-v6-card-strike">{strikePrice}</span> : null}
          </span>
          <span className="pos-v6-add" aria-hidden>
            <Plus className="size-5" strokeWidth={2.75} />
          </span>
        </span>
      </span>
    </button>
  );
}

/** Ikon bintang kecil untuk strip Favorit. */
export function PosV6FavIcon() {
  return <Star className="size-3.5" fill="currentColor" aria-hidden />;
}

/** Tombol aksi topbar V6 (tanpa kelas warna lama → tidak ikut remap tema lama). */
export function PosV6TopbarButton({
  icon: Icon,
  label,
  short,
  onClick,
  tone,
  count,
  pulse,
  className = "",
  ariaLabel,
  disabled,
  title,
  spin,
}: {
  icon: IconType;
  label: string;
  /** Label pendek di layar sempit; kosong = hanya ikon. */
  short?: string;
  onClick: () => void;
  tone?: "accent" | "good" | "warn" | "danger";
  count?: number;
  pulse?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pos-v6-tb-btn ${className}`}
      data-tone={tone}
      data-pulse={pulse ? "true" : "false"}
      onClick={onClick}
      aria-label={ariaLabel ?? (count ? `${label} (${count})` : label)}
      title={title ?? label}
      disabled={disabled}
    >
      <Icon className={`size-4 shrink-0 ${spin ? "animate-spin" : ""}`} aria-hidden />
      <span className="hidden 2xl:inline">{label}</span>
      {short ? <span className="2xl:hidden">{short}</span> : null}
      {count ? <span className="pos-v6-tb-count">{count > 99 ? "99+" : count}</span> : null}
    </button>
  );
}

export function PosV6Profile({ name, role, initials, onClick }: { name: string; role: string; initials: string; onClick: () => void }) {
  return (
    <button type="button" className="pos-v6-profile" onClick={onClick} aria-label={`Profil ${name} — buka menu kasir`}>
      <span className="pos-v6-avatar" aria-hidden>
        {initials}
      </span>
      <span className="hidden min-w-0 text-left leading-tight 2xl:block">
        <span className="block max-w-[120px] truncate text-sm font-bold">{name}</span>
        <span className="block truncate text-[11px] opacity-80">{role}</span>
      </span>
    </button>
  );
}

export function PosV6Divider() {
  return <span className="pos-v6-divider" aria-hidden />;
}
