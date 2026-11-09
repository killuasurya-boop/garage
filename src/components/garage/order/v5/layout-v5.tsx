"use client";

// Potongan layout Menu V5 (layout referensi HP/tablet/desktop + papan 00/05): ubin kategori, chip filter + toggle
// grid/list, sidebar (desktop & laci HP), navigasi bawah HP, kartu AYA, kartu lokasi & media sosial.
// Tidak ada fitur palsu: chip hanya muncul bila datanya ada; lonceng/scan/mic baru muncul di fase berikutnya.
import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight, Crown, Gift, Flame, Grid2x2, Heart, Home, Info, LayoutGrid, List, MapPin, ClipboardList, Sparkles, Star, TicketPercent, UtensilsCrossed } from "lucide-react";

import { AyaMascot } from "@/components/garage/aya/aya-mascot";
import type { MenuItem } from "@/lib/garage-api-types";
import { GARAGE_LOCATION } from "@/lib/garage-location";
import { GARAGE_SOCIALS, type GarageSocialId } from "@/lib/garage-socials";

import { MenuPhoto } from "../menu-card";
import { categoryIcon, rupiah } from "../order-ui";
import { CHIP_LABEL, type MenuChip } from "./menu-v5-model";


export type CategoryLink = { id: string; label: string; photo: MenuItem | null };

function ChipIcon({ chip }: { chip: MenuChip }) {
  if (chip === "signature") return <Crown className="size-4 text-[#ff8a86]" aria-hidden />;
  if (chip === "unggulan") return <Star className="size-4 text-[#ffd978]" fill="currentColor" aria-hidden />;
  if (chip === "best") return <Flame className="size-4 text-[#e0e0e0]" aria-hidden />;
  if (chip === "promo") return <TicketPercent className="size-4 text-[#f5a742]" aria-hidden />;
  if (chip === "favorite") return <Heart className="size-4 text-[#ff8a86]" aria-hidden />;
  return null;
}

/** Ubin kategori: HP = ikon (geser bila lebih dari 4), layar lebar = foto menu dari sistem bila ada. */
export function CategoryTilesV5({ categories, onJump }: { categories: CategoryLink[]; onJump: (id: string) => void }) {
  if (!categories.length) return null;
  return (
    <nav aria-label="Pilih kategori" className="garage-scroll-x -mx-4 mt-4 flex gap-3 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
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
      <div className="hidden shrink-0 rounded-full border border-[color:var(--gm5-line)] bg-[#111216] p-1 sm:flex" role="group" aria-label="Tampilan menu">
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

export function LocationCardV5({ open }: { open?: boolean } = {}) {
  return (
    <a href={GARAGE_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer" className="gm5-panel gm5-panel-red flex items-center gap-3 p-4 hover:brightness-110">
      <MapPin className="size-6 shrink-0 text-[var(--menu-red-bright)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="gm5-title block text-base text-white">Lokasi Garage Coffee</span>
        {open === undefined ? null : (
          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${open ? "bg-[#1f6b3a]/60 text-[#bff5cf]" : "bg-[#f5a742]/20 text-[#ffd79e]"}`}>
            <span className={`size-1.5 rounded-full ${open ? "bg-[#4ade80]" : "bg-[#f5a742]"}`} aria-hidden />
            {open ? "Buka · bisa pesan sekarang" : "Belum buka"}
          </span>
        )}
        <span className="mt-0.5 block text-sm leading-5 text-[#d4d4da]">Jl. Mayjen Sutoyo, Rambung, Tebing Tinggi</span>
      </span>
      <ArrowUpRight className="size-5 shrink-0 text-white" aria-hidden />
    </a>
  );
}

/** Semua akun sosmed resmi Garage dalam satu kartu (sidebar desktop & laci HP), satu baris per akun. */
export function SocialCardV5() {
  return (
    <section className="gm5-panel gm5-panel-red p-4" aria-labelledby="gm5-social-title">
      <h2 id="gm5-social-title" className="gm5-title text-base text-white">Ikuti Garage Coffee</h2>
      <p className="mt-0.5 text-sm leading-5 text-[#d4d4da]">Promo, menu baru, dan suasana Garage setiap hari.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {GARAGE_SOCIALS.map((social) => (
          <li key={social.id}>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="gm5-social"
              data-social={social.id}
              aria-label={`${social.label} Garage Coffee ${social.handle} (buka tab baru)`}
            >
              <span className="gm5-social-icon" aria-hidden>
                <SocialGlyph id={social.id} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-tight text-white">{social.label}</span>
                <span className="block break-all text-[13px] leading-tight text-[#d4d4da]">{social.handle}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-[#d4d4da]" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SocialGlyph({ id }: { id: GarageSocialId }) {
  if (id === "instagram") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M16.6 3c.4 2.2 1.8 3.6 4 3.8v3.1c-1.5 0-2.8-.4-4-1.2v6.2a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v3.2a2.8 2.8 0 1 0 1.9 2.6V3h3.1Z" />
      </svg>
    );
  }
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z" />
    </svg>
  );
}

/** Kartu AYA (panel desktop & sisipan HP): membuka panel chat AYA Assistant. */
export function AyaCardV5({ onAsk, compact = false }: { onAsk: () => void; compact?: boolean }) {
  return (
    <section className={`gm5-panel gm5-panel-red relative overflow-hidden ${compact ? "p-3" : "p-4"}`} aria-label="AYA, asisten menu Garage Coffee">
      <div className="flex items-center gap-3">
        <span className={`relative shrink-0 ${compact ? "size-[76px]" : "size-[88px]"}`}>
          <AyaMascot state="idle" motion="wave" role="customer" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="gm5-display block text-xl text-white">AYA</span>
          <span className="block text-sm font-semibold text-[#f3e8da]">Asisten Menu Garage Coffee</span>
          <span className="mt-1 block text-sm leading-5 text-[#d4d4da]">Cari menu, rekomendasi, atau cara pemesanan? Tanya AYA yuk!</span>
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

/** Bagian kategori yang sedang terlihat (scrollspy) untuk menyalakan item sidebar/navbar. */
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        setActive(first ? first[0] : null);
      },
      { rootMargin: "-130px 0px -55% 0px" },
    );
    for (const id of key.split("|")) {
      const el = id ? document.getElementById(id) : null;
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

export type SidebarMember = { name: string; points?: number | null } | null;

export function SidebarV5({
  categories,
  chips,
  activeChip,
  activeSection,
  favoriteCount,
  listCount,
  onHome,
  onJump,
  onChip,
  onOpenList,
  onRecommend,
  member,
  memberHref,
  registerHref,
  pointsPerThousand = 0,
  orderingOpen,
  staff = false,
}: {
  categories: CategoryLink[];
  chips: MenuChip[];
  activeChip: MenuChip;
  /** Id bagian kategori yang sedang terlihat (scrollspy). */
  activeSection?: string | null;
  favoriteCount: number;
  listCount: number;
  onHome: () => void;
  onJump: (id: string) => void;
  onChip: (chip: MenuChip) => void;
  onOpenList: () => void;
  /** Buka AYA Assistant untuk rekomendasi. */
  onRecommend?: () => void;
  member?: SidebarMember;
  memberHref: string;
  registerHref: string;
  pointsPerThousand?: number;
  /** false = kasir belum buka shift. */
  orderingOpen?: boolean;
  /** Mode waiter: tanpa kartu member & pemasaran. */
  staff?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(true);
  const shortcuts = chips.filter((chip) => chip === "signature" || chip === "unggulan" || chip === "best" || chip === "promo");
  return (
    <div className="flex flex-col gap-4">
      <nav className="gm5-panel flex flex-col gap-1 p-2" aria-label="Navigasi menu">
        <button type="button" className="gm5-side-item" aria-current={activeChip === "all" && !activeSection ? "true" : undefined} onClick={onHome}>
          <Home className="size-5" aria-hidden /> Beranda
        </button>
        <button type="button" className="gm5-side-item" aria-expanded={menuOpen} aria-controls="gm5-side-categories" onClick={() => setMenuOpen((open) => !open)}>
          <Grid2x2 className="size-5" aria-hidden /> <span className="flex-1">Menu</span>
          <ChevronDown className={`size-4 text-[#d4d4da] transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {menuOpen ? (
          <div id="gm5-side-categories" className="flex flex-col gap-0.5">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="gm5-side-item gm5-side-sub !min-h-10 pl-6 text-[15px] font-medium"
                aria-current={activeChip === "all" && activeSection === category.id ? "location" : undefined}
                onClick={() => onJump(category.id)}
              >
                {categoryIcon(category.label, "size-5 text-[#f3e8da]")}
                {category.label}
              </button>
            ))}
          </div>
        ) : null}
        {shortcuts.length || onRecommend ? <span className="my-1.5 h-px bg-white/10" aria-hidden /> : null}
        {shortcuts.map((chip) => (
          <button key={chip} type="button" className="gm5-side-item" aria-current={activeChip === chip ? "true" : undefined} onClick={() => onChip(chip)}>
            <ChipIcon chip={chip} /> {CHIP_LABEL[chip]}
          </button>
        ))}
        {onRecommend ? (
          <button type="button" className="gm5-side-item" onClick={onRecommend}>
            <Sparkles className="size-4 text-[#f5c451]" aria-hidden /> <span className="flex-1">Rekomendasi AYA</span>
          </button>
        ) : null}
        <span className="my-1.5 h-px bg-white/10" aria-hidden />
        <button type="button" className="gm5-side-item" aria-current={activeChip === "favorite" ? "true" : undefined} onClick={() => onChip("favorite")}>
          <Heart className="size-5" aria-hidden /> <span className="flex-1">Favorit Saya</span>
          {favoriteCount ? <span className="gm5-count gm5-pulse" key={favoriteCount}>{favoriteCount}</span> : null}
        </button>
        <button type="button" className="gm5-side-item" onClick={onOpenList}>
          <ClipboardList className="size-5" data-gm5-list-target aria-hidden /> <span className="flex-1">Daftar Pilihan</span>
          {listCount ? <span className="gm5-count gm5-pulse" key={listCount}>{listCount}</span> : null}
        </button>
      </nav>
      {staff ? null : <MemberCardV5 member={member ?? null} memberHref={memberHref} registerHref={registerHref} pointsPerThousand={pointsPerThousand} />}
      <SocialCardV5 />
      <LocationCardV5 open={orderingOpen} />
    </div>
  );
}

/** Kalimat poin member dari Pengaturan (poin per Rp1.000), dibulatkan agar mudah dibaca. */
export function memberPointsLine(pointsPerThousand: number) {
  if (!(pointsPerThousand > 0)) return "Simpan riwayat pesanan dan dapatkan info promo lebih dulu.";
  const tail = "bisa ditukar jadi potongan.";
  if (pointsPerThousand >= 1) return `Dapat ${pointsPerThousand.toLocaleString("id-ID")} poin tiap belanja Rp1.000, ${tail}`;
  const spend = Math.round(1000 / pointsPerThousand);
  return `Dapat 1 poin tiap belanja Rp${spend.toLocaleString("id-ID")}, ${tail}`;
}

/** Kartu member: ajakan daftar (poin dari Pengaturan) atau sapaan + saldo poin. Tanpa angka karangan. */
export function MemberCardV5({ member, memberHref, registerHref, pointsPerThousand }: { member: SidebarMember; memberHref: string; registerHref: string; pointsPerThousand: number }) {
  if (member) {
    return (
      <a href={memberHref} className="gm5-panel flex items-center gap-3 p-4 hover:brightness-110">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--garage-amber)]/15 text-[var(--garage-amber)]">
          <BadgeCheck className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="gm5-title block truncate text-sm text-white">Hai, {member.name.split(/\s+/)[0]}</span>
          <span className="block text-sm text-[#d4d4da]">
            {typeof member.points === "number" ? (
              <>
                <span className="font-mono font-bold tabular-nums text-[var(--garage-amber)]">{member.points.toLocaleString("id-ID")}</span> poin member
              </>
            ) : (
              "Member Garage Coffee"
            )}
          </span>
        </span>
        <ChevronRight className="size-5 text-white" aria-hidden />
      </a>
    );
  }
  return (
    <div className="gm5-panel gm5-member-cta p-4">
      <span className="flex items-center gap-2 text-[var(--garage-amber)]">
        <Gift className="size-5" aria-hidden />
        <span className="gm5-title text-sm">Jadi Member Garage</span>
      </span>
      <p className="mt-1 text-sm leading-5 text-[#f3e8da]">
        {memberPointsLine(pointsPerThousand)}
      </p>
      <div className="mt-3 flex gap-2">
        <a href={registerHref} className="gm5-btn-red min-h-10 flex-1 px-3 text-sm">Daftar gratis</a>
        <a href={memberHref} className="gm5-btn-ghost min-h-10 px-3 text-sm">Masuk</a>
      </div>
    </div>
  );
}

export type BottomNavTab = "home" | "menu" | "favorite" | "list" | "info";

export function BottomNavV5({
  active,
  listCount,
  listTotal,
  onSelect,
  staff = false,
}: {
  /** Mode waiter (Pesankan): hanya Beranda, Menu, Daftar Pilihan (Favorit/Info tidak relevan). */
  staff?: boolean;
  active: BottomNavTab;
  listCount: number;
  listTotal: number;
  onSelect: (tab: BottomNavTab) => void;
}) {
  const all: Array<{ tab: BottomNavTab; label: string; icon: typeof Home }> = [
    { tab: "home", label: "Beranda", icon: Home },
    { tab: "menu", label: "Menu", icon: UtensilsCrossed },
    { tab: "favorite", label: "Favorit", icon: Heart },
    { tab: "list", label: "Daftar Pilihan", icon: ClipboardList },
    { tab: "info", label: "Info", icon: Info },
  ];
  const items = staff ? all.filter((entry) => entry.tab !== "favorite" && entry.tab !== "info") : all;
  return (
    <nav className="gm5-bottom-nav lg:hidden" aria-label="Navigasi menu digital">
      <div className={`mx-auto grid max-w-xl gap-1 px-2 py-1.5 ${staff ? "grid-cols-3" : "grid-cols-5"}`}>
        {items.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            className="gm5-nav-item"
            aria-current={active === tab ? "true" : undefined}
            onClick={() => onSelect(tab)}
            data-aya-anchor={tab === "list" ? "checkout" : undefined}
          >
            <span className="relative" data-gm5-list-target={tab === "list" ? "" : undefined}>
              <Icon className="size-[22px]" aria-hidden />
              {tab === "list" && listCount ? <span className="gm5-count gm5-pulse absolute -right-3 -top-2.5" key={listCount}>{listCount}</span> : null}
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

