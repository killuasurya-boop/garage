"use client";

// Potongan layout Menu V5 (layout referensi HP/tablet/desktop + papan 00/05): ubin kategori, chip filter + toggle
// grid/list, sidebar (desktop & laci HP), navigasi bawah HP, kartu AYA, kartu lokasi & media sosial.
// Tidak ada fitur palsu: chip hanya muncul bila datanya ada; lonceng/scan/mic baru muncul di fase berikutnya.
import { ArrowUpRight, ChevronRight, Crown, Flame, Grid2x2, Heart, Home, Info, LayoutGrid, List, MapPin, ClipboardList, Sparkles, TicketPercent, UtensilsCrossed } from "lucide-react";

import { AyaMascot } from "@/components/garage/aya/aya-mascot";
import type { MenuItem } from "@/lib/garage-api-types";
import { GARAGE_LOCATION } from "@/lib/garage-location";

import { MenuPhoto } from "../menu-card";
import { categoryIcon, rupiah } from "../order-ui";
import { CHIP_LABEL, type MenuChip } from "./menu-v5-model";

export const GARAGE_INSTAGRAM = { handle: "@garage_tbt.id", href: "https://www.instagram.com/garage_tbt.id/" };
export const GARAGE_TIKTOK = { handle: "@garage_tbt.id", href: "https://www.tiktok.com/@garage_tbt.id" };

export type CategoryLink = { id: string; label: string; photo: MenuItem | null };

function ChipIcon({ chip }: { chip: MenuChip }) {
  if (chip === "signature") return <Crown className="size-4 text-[#f5c451]" aria-hidden />;
  if (chip === "best") return <Flame className="size-4 text-[#ff7a45]" aria-hidden />;
  if (chip === "promo") return <TicketPercent className="size-4 text-[#f5a742]" aria-hidden />;
  if (chip === "favorite") return <Heart className="size-4 text-[#ff8a86]" aria-hidden />;
  return null;
}

/** Ubin kategori: HP = ikon (geser bila lebih dari 4), layar lebar = foto menu dari sistem bila ada. */
export function CategoryTilesV5({ categories, onJump }: { categories: CategoryLink[]; onJump: (id: string) => void }) {
  if (!categories.length) return null;
  return (
    <nav aria-label="Kategori menu" className="garage-scroll-x -mx-4 mt-4 flex gap-3 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
      {categories.map((category, index) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onJump(category.id)}
          className="gm5-tile gm5-rise w-[88px] shrink-0 sm:w-auto lg:min-h-[132px] lg:justify-end lg:pb-3"
          style={{ ["--gm5-i" as string]: index }}
        >
          {category.photo ? (
            <span className="hidden lg:absolute lg:inset-x-3 lg:top-2 lg:block lg:h-[78px] lg:overflow-hidden lg:rounded-xl" aria-hidden>
              <MenuPhoto item={category.photo} hideLabel />
            </span>
          ) : null}
          <span className={category.photo ? "lg:hidden" : ""}>{categoryIcon(category.label, "size-8 text-white")}</span>
          <span className="relative px-1 text-center text-sm leading-tight">{category.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function FilterChipsV5({
  chips,
  active,
  onChange,
  layout,
  onLayout,
}: {
  chips: MenuChip[];
  active: MenuChip;
  onChange: (chip: MenuChip) => void;
  layout: "grid" | "list";
  onLayout: (layout: "grid" | "list") => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <div className="garage-scroll-x -mx-4 flex min-w-0 flex-1 gap-2 px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter menu">
        {chips.map((chip) => (
          <button key={chip} type="button" className="gm5-chip" aria-pressed={chip === active} onClick={() => onChange(chip)}>
            <ChipIcon chip={chip} />
            {CHIP_LABEL[chip]}
          </button>
        ))}
      </div>
      <div className="hidden shrink-0 rounded-full border border-[color:var(--gm5-line)] bg-[#141214] p-1 sm:flex" role="group" aria-label="Tampilan menu">
        <button type="button" className={`gm5-icon-btn !h-9 !w-11 !rounded-full ${layout === "grid" ? "gm5-btn-red !border-0" : ""}`} aria-pressed={layout === "grid"} aria-label="Tampilan kotak" onClick={() => onLayout("grid")}>
          <LayoutGrid className="size-4" aria-hidden />
        </button>
        <button type="button" className={`gm5-icon-btn !h-9 !w-11 !rounded-full ${layout === "list" ? "gm5-btn-red !border-0" : ""}`} aria-pressed={layout === "list"} aria-label="Tampilan daftar" onClick={() => onLayout("list")}>
          <List className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function LocationCardV5() {
  return (
    <a href={GARAGE_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer" className="gm5-panel gm5-panel-red flex items-center gap-3 p-4 hover:brightness-110">
      <MapPin className="size-6 shrink-0 text-[var(--menu-red-bright)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="gm5-title block text-base text-white">Lokasi Garage Coffee</span>
        <span className="mt-0.5 block text-sm leading-5 text-[#cfc9c4]">Jl. Mayjen Sutoyo, Rambung, Tebing Tinggi</span>
      </span>
      <ArrowUpRight className="size-5 shrink-0 text-white" aria-hidden />
    </a>
  );
}

export function SocialCardV5() {
  return (
    <div className="gm5-panel flex items-center gap-3 p-4">
      <span className="gm5-title flex-1 text-base text-white">Ikuti Kami</span>
      <a href={GARAGE_INSTAGRAM.href} target="_blank" rel="noopener noreferrer" className="gm5-icon-btn border border-white/10" aria-label={`Instagram ${GARAGE_INSTAGRAM.handle}`}>
        <InstagramGlyph />
      </a>
      <a href={GARAGE_TIKTOK.href} target="_blank" rel="noopener noreferrer" className="gm5-icon-btn border border-white/10" aria-label={`TikTok ${GARAGE_TIKTOK.handle}`}>
        <TiktokGlyph />
      </a>
    </div>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TiktokGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M16.6 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5 0-2.8-.4-4-1.2v6.2a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v3.2a2.8 2.8 0 1 0 1.9 2.6V3h3.1Z" />
    </svg>
  );
}

/** Kartu AYA (panel desktop & sisipan HP). Mikrofon/chat baru dibangun di Fase 4 — kini membuka sapaan AYA. */
export function AyaCardV5({ onAsk, compact = false }: { onAsk: () => void; compact?: boolean }) {
  return (
    <section className={`gm5-panel gm5-panel-red relative overflow-hidden ${compact ? "p-3" : "p-4"}`} aria-label="AYA, asisten menu Garage Coffee">
      <div className="flex items-center gap-3">
        <span className={`relative shrink-0 ${compact ? "size-[76px]" : "size-[88px]"}`}>
          <AyaMascot state="idle" motion="wave" role="customer" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="gm5-display block text-xl text-white">AYA</span>
          <span className="block text-sm font-semibold text-[#ede6dc]">Asisten Menu Garage Coffee</span>
          <span className="mt-1 block text-sm leading-5 text-[#cfc9c4]">Cari menu, rekomendasi, atau cara pemesanan? Tanya AYA yuk!</span>
        </span>
        {compact ? (
          <button type="button" onClick={onAsk} className="gm5-btn-red min-h-11 shrink-0 px-4 text-sm">
            <Sparkles className="size-4" aria-hidden />
            Tanya
          </button>
        ) : null}
      </div>
      {compact ? null : (
        <button type="button" onClick={onAsk} className="gm5-btn-red mt-3 min-h-11 w-full text-sm">
          <Sparkles className="size-4" aria-hidden />
          Tanya AYA
        </button>
      )}
    </section>
  );
}

export function SidebarV5({
  categories,
  chips,
  activeChip,
  favoriteCount,
  listCount,
  onHome,
  onJump,
  onChip,
  onOpenList,
}: {
  categories: CategoryLink[];
  chips: MenuChip[];
  activeChip: MenuChip;
  favoriteCount: number;
  listCount: number;
  onHome: () => void;
  onJump: (id: string) => void;
  onChip: (chip: MenuChip) => void;
  onOpenList: () => void;
}) {
  const shortcuts = chips.filter((chip) => chip === "signature" || chip === "best" || chip === "promo");
  return (
    <div className="flex flex-col gap-4">
      <nav className="gm5-panel flex flex-col gap-1 p-2" aria-label="Navigasi menu">
        <button type="button" className="gm5-side-item" aria-current={activeChip === "all" ? "true" : undefined} onClick={onHome}>
          <Home className="size-5" aria-hidden /> Beranda
        </button>
        <p className="mt-2 flex items-center gap-3 px-3.5 text-sm font-semibold text-[#cfc9c4]">
          <Grid2x2 className="size-5" aria-hidden /> Menu
        </p>
        {categories.map((category) => (
          <button key={category.id} type="button" className="gm5-side-item !min-h-10 pl-6 text-[15px] font-medium" onClick={() => onJump(category.id)}>
            {categoryIcon(category.label, "size-5 text-[#ede6dc]")}
            {category.label}
          </button>
        ))}
        {shortcuts.length ? <span className="my-1.5 h-px bg-white/10" aria-hidden /> : null}
        {shortcuts.map((chip) => (
          <button key={chip} type="button" className="gm5-side-item" aria-current={activeChip === chip ? "true" : undefined} onClick={() => onChip(chip)}>
            <ChipIcon chip={chip} /> {CHIP_LABEL[chip]}
          </button>
        ))}
        <span className="my-1.5 h-px bg-white/10" aria-hidden />
        <button type="button" className="gm5-side-item" aria-current={activeChip === "favorite" ? "true" : undefined} onClick={() => onChip("favorite")}>
          <Heart className="size-5" aria-hidden /> <span className="flex-1">Favorit Saya</span>
          {favoriteCount ? <span className="gm5-count">{favoriteCount}</span> : null}
        </button>
        <button type="button" className="gm5-side-item" onClick={onOpenList}>
          <ClipboardList className="size-5" aria-hidden /> <span className="flex-1">Daftar Pilihan</span>
          {listCount ? <span className="gm5-count">{listCount}</span> : null}
        </button>
      </nav>
      <a href={GARAGE_INSTAGRAM.href} target="_blank" rel="noopener noreferrer" className="gm5-panel gm5-panel-red flex items-center gap-3 p-4 hover:brightness-110">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white">
          <InstagramGlyph />
        </span>
        <span className="min-w-0 flex-1">
          <span className="gm5-title block text-sm text-white">Follow Instagram Kami</span>
          <span className="block truncate text-sm text-[#cfc9c4]">{GARAGE_INSTAGRAM.handle}</span>
        </span>
        <ChevronRight className="size-5 text-white" aria-hidden />
      </a>
      <LocationCardV5 />
    </div>
  );
}

export type BottomNavTab = "home" | "menu" | "favorite" | "list" | "info";

export function BottomNavV5({
  active,
  listCount,
  listTotal,
  onSelect,
}: {
  active: BottomNavTab;
  listCount: number;
  listTotal: number;
  onSelect: (tab: BottomNavTab) => void;
}) {
  const items: Array<{ tab: BottomNavTab; label: string; icon: typeof Home }> = [
    { tab: "home", label: "Beranda", icon: Home },
    { tab: "menu", label: "Menu", icon: UtensilsCrossed },
    { tab: "favorite", label: "Favorit", icon: Heart },
    { tab: "list", label: "Daftar Pilihan", icon: ClipboardList },
    { tab: "info", label: "Info", icon: Info },
  ];
  return (
    <nav className="gm5-bottom-nav lg:hidden" aria-label="Navigasi menu digital">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1 px-2 py-1.5">
        {items.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            className="gm5-nav-item"
            aria-current={active === tab ? "true" : undefined}
            onClick={() => onSelect(tab)}
            data-aya-anchor={tab === "list" ? "checkout" : undefined}
          >
            <span className="relative">
              <Icon className="size-[22px]" aria-hidden />
              {tab === "list" && listCount ? <span className="gm5-count gm5-pop absolute -right-3 -top-2.5" key={listCount}>{listCount}</span> : null}
            </span>
            {tab === "list" && listCount ? (
              <span className="whitespace-nowrap font-mono text-[11px] font-bold leading-tight tabular-nums">{rupiah.format(listTotal)}</span>
            ) : (
              <span className="line-clamp-2 max-w-full break-words px-0.5 text-center leading-[1.1]">{label}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

