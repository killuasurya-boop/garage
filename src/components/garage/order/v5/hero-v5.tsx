"use client";

// Hero Menu V5 (layout HP/tablet/desktop): judul miring tebal, daftar kategori dari data, tombol "Lihat Menu",
// foto menu unggulan (dari sistem) dengan emblem segitiga resmi Garage di belakangnya, titik penanda untuk
// mengganti foto, dan 4 poin keunggulan di layar lebar. Tanpa rotasi otomatis (tidak mengganggu, ringan di HP).
import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Coffee, Leaf, ThumbsUp, Zap } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";

const POINTS = [
  { icon: Coffee, label: "Racikan Premium" },
  { icon: Leaf, label: "Bahan Berkualitas" },
  { icon: ThumbsUp, label: "Menu Favorit Pelanggan" },
  { icon: Zap, label: "Proses Cepat dan Fresh" },
];

export function HeroV5({
  categories,
  items,
  onSeeMenu,
  onOpenItem,
}: {
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
          <h2 className="gm5-display text-[30px] leading-[1.02] text-white sm:text-[40px] lg:text-[44px]">
            Nikmati
            <br />
            Racikan Terbaik
          </h2>
          <span className="gm5-swash -mt-1 w-28 sm:w-40" aria-hidden />
          {categories.length ? (
            <p className="text-sm leading-5 text-[#ede6dc] sm:text-[15px]">{categories.join(" • ")}</p>
          ) : null}
          <p className="hidden text-sm text-[#cfc9c4] sm:block">Pilihan terbaik khas Garage Coffee.</p>
          <span>
            <button type="button" onClick={onSeeMenu} className="gm5-btn-red min-h-11 px-5 text-[15px]">
              Lihat Menu <ArrowRight className="size-4" aria-hidden />
            </button>
          </span>
        </div>

        <div className="relative min-h-[200px]">
          <Image
            src="/garage-brand/garage-coffee-icon.png"
            alt=""
            width={512}
            height={512}
            className="gm5-hero-emblem right-[-14%] top-[-4%] h-[118%] w-auto"
            priority
          />
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
          {POINTS.map(({ icon: Icon, label }) => (
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
