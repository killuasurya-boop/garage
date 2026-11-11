"use client";

// Header Menu V5 (layout referensi): HP = menu (laci) · logo tengah · cari · login (meja tampil di kartu tipe pesanan);
// desktop = logo · "Digital Menu" · navigasi Beranda/Menu/Pilihan/Promo/Tentang · tombol cari · suara AYA · meja · login.
// Navbar lengkap (papan desktop): Menu ▾ berisi kategori, Rekomendasi, Promo (hanya bila ada), pintasan cari "/" atau
// Ctrl/⌘K, tombol AYA (buka asisten), lonceng = status pesanan & chat kasir (hanya bila ada pesanan/chat).
// Scan QR tidak dipasang: pelanggan memindai QR meja dengan kamera HP, tidak ada fungsi scan di dalam menu.
import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import { GARAGE_BRAND_ASSETS } from "@/lib/garage-brand-assets";
import Link from "next/link";
import { ArrowLeft, AudioLines, Bell, ChevronDown, Clock, LogIn, Menu as MenuIcon, Search, UserRound } from "lucide-react";

import { AyaSoundToggle } from "@/components/garage/aya/aya-sound-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type HeaderSubLink = { key: string; label: string; icon?: ReactNode; onSelect: () => void };
export type HeaderNavLink = { key: string; label: string; current?: boolean; menu?: HeaderSubLink[] } & (
  | { onSelect: () => void; href?: never }
  | { href: string; onSelect?: never }
);
export type HeaderNotice = { count: number; label: string; onOpen: () => void };

/** Pintasan cari: "/" atau Ctrl/⌘K, kecuali saat sedang mengetik. */
export function isSearchShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">, typing: boolean) {
  if (event.altKey) return false;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") return true;
  return !typing && !event.ctrlKey && !event.metaKey && event.key === "/";
}

export function HeaderV5({
  dineIn,
  tableLabel,
  tableCode,
  channelLabel,
  loginHref,
  memberName,
  staff,
  nav,
  onOpenDrawer,
  onSearch,
  onAya,
  notice,
  info,
  onTable,
  titleLevel = 1,
}: {
  /** 2 = halaman sudah punya H1 sendiri (mis. judul event), judul header turun ke H2. */
  titleLevel?: 1 | 2;
  /** Mode Daftar Pilihan: ketuk chip meja = buka pemilih meja (info saja). */
  onTable?: () => void;
  /** Buka AYA Assistant. */
  onAya?: () => void;
  /** Lonceng: status pesanan / chat kasir; kosong = lonceng tidak tampil. */
  notice?: HeaderNotice | null;
  /** Info singkat (mis. perkiraan waktu siap) di bawah header. */
  info?: string;
  dineIn: boolean;
  tableLabel: string;
  tableCode: string;
  channelLabel: string;
  loginHref: string;
  memberName?: string | null;
  /** Mode waiter (Pesankan): kembali ke daftar meja, tanpa login. */
  staff?: { name: string; backHref: string } | null;
  nav: HeaderNavLink[];
  onOpenDrawer: () => void;
  onSearch: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if (!isSearchShortcut(event, typing)) return;
      event.preventDefault();
      onSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearch]);

  const chipInner = (
    <>
      <span className="text-xs font-semibold text-[#d4d4da]">{dineIn ? "Meja" : "Order"}</span>
      <span className="font-mono text-base font-bold tabular-nums text-white">{tableCode}</span>
    </>
  );
  const tableChip = onTable ? (
    <button
      type="button"
      onClick={onTable}
      className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[color:var(--gm5-line)] bg-[#111216] px-3 hover:border-[var(--menu-red)]"
      aria-label={`${tableCode === "?" || !/\d/.test(tableCode) ? "Pilih meja" : tableLabel} — ubah meja`}
    >
      {chipInner}
    </button>
  ) : (
    <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--gm5-line)] bg-[#111216] px-3" aria-label={dineIn ? tableLabel : channelLabel}>
      {chipInner}
    </span>
  );
  const account = staff ? (
    <Link href={staff.backHref} className="gm5-btn-ghost min-h-11 shrink-0 px-3 text-sm" aria-label="Kembali ke daftar meja">
      <ArrowLeft className="size-4 text-[var(--garage-amber)]" aria-hidden />
      <span>Meja</span>
    </Link>
  ) : (
    <Link href={loginHref} className="gm5-icon-btn shrink-0 border border-[color:var(--gm5-line)] lg:w-auto lg:gap-2 lg:px-3" aria-label={memberName ? `Member ${memberName}` : "Login member"}>
      {memberName ? <UserRound className="size-5 text-[var(--garage-amber)]" aria-hidden /> : <LogIn className="size-5 text-[var(--garage-amber)]" aria-hidden />}
      <span className="hidden max-w-[120px] truncate text-sm font-semibold lg:inline">{memberName ?? "Login"}</span>
    </Link>
  );

  return (
    <header className="relative pt-2">
      {titleLevel === 1 ? (
        <h1 className="sr-only">Menu digital Garage Coffee — {dineIn ? tableLabel : channelLabel}</h1>
      ) : (
        <h2 className="sr-only">Menu digital Garage Coffee — {dineIn ? tableLabel : channelLabel}</h2>
      )}
      <div className="flex items-center gap-2 lg:gap-5">
        <button type="button" className="gm5-icon-btn shrink-0 lg:hidden" aria-label="Buka navigasi menu" onClick={onOpenDrawer}>
          <MenuIcon className="size-6" aria-hidden />
        </button>
        <Link href="/" className="flex min-h-11 min-w-0 flex-1 items-center justify-center lg:w-[188px] lg:flex-none lg:justify-start" aria-label="Kembali ke website Garage">
          <Image
            src={GARAGE_BRAND_ASSETS.wordmark}
            alt="Garage Coffee"
            width={1200}
            height={282}
            priority
            sizes="(max-width: 1024px) 150px, 188px"
            className="h-auto w-[150px] object-contain lg:w-[188px]"
          />
        </Link>
        <div className="hidden min-w-0 border-l-2 border-[var(--menu-red)] pl-4 xl:block">
          <p className="gm5-display text-xl text-white">Digital Menu</p>
          <p className="text-sm text-[#d4d4da]">{staff ? `Waiter: ${staff.name}` : dineIn ? tableLabel : channelLabel}</p>
        </div>
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Bagian menu">
          {nav.map((link) => {
            const cls = "relative inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-[15px] font-semibold text-[#f3e8da] hover:text-white aria-[current=true]:text-white";
            const bar = <span className={`absolute inset-x-3 bottom-1 h-[3px] rounded-full ${link.current ? "bg-[var(--menu-red)] shadow-[0_0_10px_var(--menu-red)]" : "bg-transparent"}`} aria-hidden />;
            if (link.menu?.length) {
              return (
                <DropdownMenu key={link.key} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-current={link.current ? "true" : undefined} className={`${cls} gap-1`}>
                      {link.label}
                      <ChevronDown className="size-4" aria-hidden />
                      {bar}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={8} className="gm5 z-[80] w-60 rounded-xl border border-[color:var(--gm5-line)] bg-[#111216] p-1.5 text-white">
                    <DropdownMenuItem onSelect={link.onSelect} className="min-h-10 cursor-pointer rounded-lg px-3 text-[15px] font-semibold focus:bg-[color:var(--menu-red)]/25 focus:text-white">
                      Semua menu
                    </DropdownMenuItem>
                    {link.menu.map((sub) => (
                      <DropdownMenuItem key={sub.key} onSelect={sub.onSelect} className="min-h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-[15px] focus:bg-[color:var(--menu-red)]/25 focus:text-white">
                        {sub.icon}
                        {sub.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            return link.href ? (
              <Link key={link.key} href={link.href} className={cls}>{link.label}{bar}</Link>
            ) : (
              <button key={link.key} type="button" onClick={link.onSelect} aria-current={link.current ? "true" : undefined} className={cls}>{link.label}{bar}</button>
            );
          })}
        </nav>
        <button type="button" onClick={onSearch} aria-keyshortcuts="/ Control+K Meta+K" className="hidden min-h-11 w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[color:var(--gm5-line)] bg-[#111216] px-4 text-left text-sm text-[#b8b8be] hover:border-[var(--menu-red)] xl:flex">
          <Search className="size-4 text-white" aria-hidden /> <span className="flex-1">Cari menu favorit…</span>
          <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-[#d4d4da]">/</kbd>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="gm5-icon-btn xl:hidden" aria-label="Cari menu" onClick={onSearch}>
            <Search className="size-[22px]" aria-hidden />
          </button>
          {notice ? (
            <button type="button" className="gm5-icon-btn relative" aria-label={notice.count ? `${notice.label}, ${notice.count} pesan baru` : notice.label} onClick={notice.onOpen}>
              <Bell className="size-[22px]" aria-hidden />
              {notice.count ? <span className="gm5-count gm5-pulse absolute -right-1 -top-1" key={notice.count}>{notice.count > 9 ? "9+" : notice.count}</span> : null}
            </button>
          ) : null}
          {onAya ? (
            <button type="button" className="gm5-icon-btn hidden text-[var(--menu-red-bright)] lg:inline-flex" aria-label="Tanya AYA" onClick={onAya}>
              <AudioLines className="size-[22px]" aria-hidden />
            </button>
          ) : null}
          {staff ? null : <span className="hidden 2xl:inline-flex"><AyaSoundToggle audience="customer" /></span>}
          <span className="hidden sm:inline-flex">{tableChip}</span>
          {account}
        </div>
      </div>
      {info ? (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-[#d4d4da] lg:justify-start lg:pl-[4px]">
          <Clock className="size-3.5 text-[var(--garage-amber)]" aria-hidden /> {info}
        </p>
      ) : null}
    </header>
  );
}
