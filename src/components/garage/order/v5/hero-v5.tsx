"use client";

// Hero Menu V5 (papan desktop/HP): panggung = foto menu asli dari sistem (kartu poster) di depan emblem segitiga resmi
// Garage UTUH (garage-coffee-emblem.png = garage-coffee-icon.png dengan latar hitam dihapus, bentuk tidak diubah;
// object-contain, tanpa crop/blend).
// Teks bernada angkringan (Owner, Nov 2026): headline, satu subjudul, info siap dari tipe pesanan, CTA kontekstual.
// Satu momen gerak saat masuk (foto + emblem), mati saat prefers-reduced-motion. Tanpa rotasi otomatis.
import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Clock, Coffee, ThumbsUp, Users } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";

const EMBLEM = { src: "/garage-brand/garage-coffee-emblem.png", width: 386, height: 305 };

const POINTS = [
  { icon: Users, label: "Nongkrong santai bareng teman" },
  { icon: Coffee, label: "Racikan khas Garage" },
  { icon: ThumbsUp, label: "Favorit pelanggan" },
];

/** Foto panggung hero: menu sorotan berfoto; bila kosong, menu lain berfoto (minuman dulu). Maks 5, tanpa yang habis. */
export function heroPhotoItems(highlight: readonly MenuItem[], all: readonly MenuItem[], limit = 5): MenuItem[] {
  const usable = (item: MenuItem) => Boolean(item.imageUrl) && item.stock !== "sold_out" && item.showInDigitalMenu !== false;
  const picked = highlight.filter(usable);
  if (picked.length) return picked.slice(0, limit);
  const drinkRank = (item: MenuItem) => (item.category === "Coffee" ? 0 : item.category === "Non-Coffee" ? 1 : 2);
  return all
    .filter(usable)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => drinkRank(a.item) - drinkRank(b.item) || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function HeroV5({
  items,
  onSeeMenu,
  onOpenItem,
  ctaLabel = "Lihat Menu",
  eta,
}: {
  /** Foto panggung (lihat `heroPhotoItems`). */
  items: MenuItem[];
  onSeeMenu: () => void;
  onOpenItem: (item: MenuItem) => void;
  /** Label tombol utama (lihat `heroCtaLabel`). */
  ctaLabel?: string;
  /** Info siap/antar dari tipe pesanan (mis. "Siap ambil 15–20 menit"); kosong = tidak ditampilkan. */
  eta?: string;
}) {
  const [active, setActive] = useState(0);
  const current = items[Math.min(active, Math.max(0, items.length - 1))];

  return (
    <section className="gm5-hero mt-3" aria-label="Sorotan Garage Coffee">
      <div className="relative grid min-h-[248px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:min-h-[300px] 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
        <div className="relative z-10 flex min-w-0 flex-col justify-center gap-3 py-5 pl-4 pr-1 sm:gap-4 sm:p-7">
          <h2 className="gm5-display text-[31px] leading-[0.98] text-white sm:text-[46px] lg:text-[50px]">
            Racikan Garage,
            <br />
            Bikin Nagih.
          </h2>
          <span className="gm5-swash w-24 sm:w-40" aria-hidden />
          <p className="max-w-[26ch] text-sm leading-5 text-[#f3e8da] sm:text-base sm:leading-6">Tempat nongkrong santai, kopi dan cemilan khas Garage.</p>
          {eta ? (
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-1 text-xs font-semibold text-[#ffd79e] sm:text-sm 2xl:hidden">
              <Clock className="size-3.5 shrink-0" aria-hidden /> {eta}
            </p>
          ) : null}
          <span>
            <button type="button" onClick={onSeeMenu} className="gm5-btn-red min-h-11 px-5 text-[15px]">
              {ctaLabel} <ArrowRight className="size-4" aria-hidden />
            </button>
          </span>
        </div>

        {/* Panggung: emblem resmi utuh di belakang, foto menu di depan. */}
        <div className="gm5-hero-stage relative min-h-[230px] sm:min-h-[300px]">
          <Image
            src={EMBLEM.src}
            alt=""
            width={EMBLEM.width}
            height={EMBLEM.height}
            sizes="(max-width: 640px) 50vw, 420px"
            className="gm5-hero-emblem"
            priority
          />
          {current ? (
            <button type="button" onClick={() => onOpenItem(current)} className="gm5-hero-photo" aria-label={`Lihat ${current.name}`}>
              <MenuPhoto key={current.id} item={current} eager />
            </button>
          ) : null}
          {items.length > 1 ? (
            <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center" role="group" aria-label="Ganti foto menu">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Foto ${index + 1}: ${item.name}`}
                  aria-pressed={index === active}
                  className="flex h-11 w-8 cursor-pointer items-end justify-center pb-2"
                >
                  <span className={`block h-2 rounded-full transition-all ${index === active ? "w-5 bg-[var(--menu-red)]" : "w-2 bg-white/70"}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <ul className="hidden min-w-[210px] flex-col justify-center gap-4 border-l border-white/10 px-6 py-5 2xl:flex" aria-label="Keunggulan Garage Coffee">
          {[...POINTS, ...(eta ? [{ icon: Clock, label: eta }] : [])].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-semibold text-[#f3e8da]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5">
                <Icon className="size-5 text-[#f3e8da]" aria-hidden />
              </span>
              <span className="max-w-[9rem] leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
