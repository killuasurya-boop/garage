"use client";

// Hero Menu V5: copy pemasaran bernada angkringan (Owner, Nov 2026), kategori & ETA dari data, CTA kontekstual,
// foto menu unggulan dari sistem. Logo = logo resmi garage-coffee-logo.png UTUH (object-contain, tanpa crop/blend):
// besar di kolom kanan bila belum ada foto, kecil sebagai tanda merek di atas foto. Tanpa rotasi otomatis.
import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Clock, Coffee, ThumbsUp, Users } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";

const LOGO = { src: "/garage-brand/garage-coffee-logo.png", width: 1200, height: 282 };

const POINTS = [
  { icon: Users, label: "Nongkrong santai bareng teman" },
  { icon: Coffee, label: "Racikan khas Garage" },
  { icon: ThumbsUp, label: "Favorit pelanggan" },
];

export function HeroV5({
  categories,
  items,
  onSeeMenu,
  onOpenItem,
  ctaLabel = "Lihat Menu",
  eta,
}: {
  /** Label tombol utama (lihat `heroCtaLabel`). */
  ctaLabel?: string;
  /** Info siap/antar dari tipe pesanan (mis. "Siap ambil 15–20 menit"); kosong = tidak ditampilkan. */
  eta?: string;
  categories: string[];
  /** Menu unggulan/terlaris dari sistem; foto pertama yang ada dipakai. */
  items: MenuItem[];
  onSeeMenu: () => void;
  onOpenItem: (item: MenuItem) => void;
}) {
  const withPhoto = items.filter((item) => item.imageUrl).slice(0, 5);
  const [active, setActive] = useState(0);
  const current = withPhoto[Math.min(active, Math.max(0, withPhoto.length - 1))];

  return (
    <section className="gm5-hero gm5-rise mt-3" aria-label="Sorotan Garage Coffee">
      <div className="relative grid min-h-[230px] grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sm:min-h-[260px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_auto]">
        <div className="flex min-w-0 flex-col justify-center gap-3 p-4 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--menu-red-bright)] sm:text-xs">
            <span className="whitespace-nowrap">Garage Coffee</span> <span className="whitespace-nowrap">· Tebing Tinggi</span>
          </p>
          <h2 className="gm5-display text-[30px] leading-[1.02] text-white sm:text-[40px] lg:text-[44px]">
            Racikan Garage,
            <br />
            <span className="text-[var(--menu-red-bright)]">Bikin Nagih.</span>
          </h2>
          <span className="gm5-swash -mt-1 w-28 sm:w-40" aria-hidden />
          <p className="text-sm leading-5 text-[#ede6dc] sm:text-[15px]">Tempat nongkrong santai, kopi &amp; cemilan khas Garage.</p>
          {categories.length ? <p className="hidden text-sm text-[#cfc9c4] sm:block">{categories.join(" • ")}</p> : null}
          {eta ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#ffd79e] lg:hidden">
              <Clock className="size-4 shrink-0" aria-hidden /> {eta}
            </p>
          ) : null}
          <span>
            <button type="button" onClick={onSeeMenu} className="gm5-btn-red min-h-11 px-5 text-[15px]">
              {ctaLabel} <ArrowRight className="size-4" aria-hidden />
            </button>
          </span>
        </div>

        <div className="relative min-h-[200px]">
          {current ? null : (
            <span className="gm5-hero-logo" aria-hidden>
              <Image src={LOGO.src} alt="" width={LOGO.width} height={LOGO.height} sizes="(max-width: 640px) 45vw, 340px" className="h-auto w-full object-contain" priority />
            </span>
          )}
          {current ? (
            <button
              type="button"
              onClick={() => onOpenItem(current)}
              className="gm5-hero-photo inset-[6%_4%_14%_6%] block cursor-pointer"
              aria-label={`Lihat ${current.name}`}
            >
              <MenuPhoto key={current.id} item={current} eager />
            </button>
          ) : null}
          {current ? (
            <span className="gm5-hero-mark" aria-hidden>
              <Image src={LOGO.src} alt="" width={LOGO.width} height={LOGO.height} sizes="120px" className="h-auto w-full object-contain" />
            </span>
          ) : null}
          {withPhoto.length > 1 ? (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1" role="group" aria-label="Ganti foto menu unggulan">
              {withPhoto.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Foto ${index + 1}: ${item.name}`}
                  aria-pressed={index === active}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center"
                >
                  <span className={`block h-2 rounded-full transition-all ${index === active ? "w-5 bg-[var(--menu-red)]" : "w-2 bg-white/70"}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <ul className="hidden min-w-[210px] flex-col justify-center gap-4 border-l border-white/10 px-6 py-5 lg:flex" aria-label="Keunggulan Garage Coffee">
          {[...POINTS, ...(eta ? [{ icon: Clock, label: eta }] : [])].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-semibold text-[#ede6dc]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5">
                <Icon className="size-5 text-[#ede6dc]" aria-hidden />
              </span>
              <span className="max-w-[9rem] leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
