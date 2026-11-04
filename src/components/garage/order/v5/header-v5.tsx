"use client";

// Header Menu V5 (layout referensi): HP = menu (laci) · logo tengah · cari · login (meja tampil di kartu tipe pesanan);
// desktop = logo · "Digital Menu" · navigasi Beranda/Menu/Pilihan/Promo/Tentang · tombol cari · suara AYA · meja · login.
// Lonceng & scan di referensi belum punya fungsi nyata di sistem → belum ditampilkan (tanpa tombol palsu).
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, LogIn, Menu as MenuIcon, Search, UserRound } from "lucide-react";

import { AyaSoundToggle } from "@/components/garage/aya/aya-sound-toggle";

export type HeaderNavLink = { key: string; label: string; current?: boolean } & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

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
  info,
}: {
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
  const tableChip = (
    <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--gm5-line)] bg-[#141214] px-3" aria-label={dineIn ? tableLabel : channelLabel}>
      <span className="text-xs font-semibold text-[#cfc9c4]">{dineIn ? "Meja" : "Order"}</span>
      <span className="font-mono text-base font-bold tabular-nums text-white">{tableCode}</span>
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
      <h1 className="sr-only">Menu digital Garage Coffee — {dineIn ? tableLabel : channelLabel}</h1>
      <div className="flex items-center gap-2 lg:gap-5">
        <button type="button" className="gm5-icon-btn shrink-0 lg:hidden" aria-label="Buka navigasi menu" onClick={onOpenDrawer}>
          <MenuIcon className="size-6" aria-hidden />
        </button>
        <Link href="/" className="flex min-h-11 min-w-0 flex-1 items-center justify-center lg:w-[188px] lg:flex-none lg:justify-start" aria-label="Kembali ke website Garage">
          <Image
            src="/garage-brand/garage-coffee-logo.png"
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
          <p className="text-sm text-[#cfc9c4]">{staff ? `Waiter: ${staff.name}` : dineIn ? tableLabel : channelLabel}</p>
        </div>
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Bagian menu">
          {nav.map((link) => {
            const cls = "relative inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-[15px] font-semibold text-[#ede6dc] hover:text-white aria-[current=true]:text-white";
            const bar = <span className={`absolute inset-x-3 bottom-1 h-[3px] rounded-full ${link.current ? "bg-[var(--menu-red)] shadow-[0_0_10px_var(--menu-red)]" : "bg-transparent"}`} aria-hidden />;
            return link.href ? (
              <Link key={link.key} href={link.href} className={cls}>{link.label}{bar}</Link>
            ) : (
              <button key={link.key} type="button" onClick={link.onSelect} aria-current={link.current ? "true" : undefined} className={cls}>{link.label}{bar}</button>
            );
          })}
        </nav>
        <button type="button" onClick={onSearch} className="hidden min-h-11 w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[color:var(--gm5-line)] bg-[#141214] px-4 text-left text-sm text-[#a7a09b] hover:border-[var(--menu-red)] xl:flex">
          <Search className="size-4 text-white" aria-hidden /> Cari menu favorit…
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="gm5-icon-btn xl:hidden" aria-label="Cari menu" onClick={onSearch}>
            <Search className="size-[22px]" aria-hidden />
          </button>
          {staff ? null : <span className="hidden lg:inline-flex"><AyaSoundToggle audience="customer" /></span>}
          <span className="hidden sm:inline-flex">{tableChip}</span>
          {account}
        </div>
      </div>
      {info ? (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-[#cfc9c4] lg:justify-start lg:pl-[4px]">
          <Clock className="size-3.5 text-[var(--garage-amber)]" aria-hidden /> {info}
        </p>
      ) : null}
    </header>
  );
}
