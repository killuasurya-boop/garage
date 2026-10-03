"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Plus, Star, TicketPercent } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto, MenuPrice, needsDetailSheet } from "./menu-card";
import { itemCartQty } from "./order-ui";

export type HeroKind = "featured" | "promo" | "best";

const HERO_COPY: Record<HeroKind, { title: string; caption: string; icon: typeof Star }> = {
  featured: { title: "Unggulan", caption: "Pilihan Garage hari ini", icon: Star },
  promo: { title: "Promo", caption: "Harga spesial", icon: TicketPercent },
  best: { title: "Terlaris", caption: "Favorit pelanggan", icon: Flame },
};

// Banner foto besar 16:9 yang bisa digeser (scroll-snap, tanpa auto-rotate supaya
// tidak mengganggu & ringan di HP). Indikator titik mengikuti kartu yang terlihat.
export function HeroRail({
  id,
  kind,
  items,
  cart,
  onQuickAdd,
  onOpen,
}: {
  id: string;
  kind: HeroKind;
  items: MenuItem[];
  cart: Record<string, number>;
  onQuickAdd: (item: MenuItem) => void;
  onOpen: (item: MenuItem) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || items.length < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const cards = Array.from(strip.children) as HTMLElement[];
      const center = strip.scrollLeft + strip.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items.length]);

  if (!items.length) return null;
  // Jumlah item bisa berkurang (mis. item jadi habis) → jaga titik aktif tetap valid.
  const activeIndex = Math.min(active, items.length - 1);
  const copy = HERO_COPY[kind];
  const Icon = copy.icon;

  function jumpTo(index: number) {
    const card = stripRef.current?.children[index] as HTMLElement | undefined;
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "start" });
  }

  return (
    <section id={id} data-order-section={copy.title} className="scroll-mt-[124px] pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-garage-amber" aria-hidden />
        <h2 className="garage-display text-[22px] leading-none tracking-wide text-white">{copy.title}</h2>
        <span className="min-w-0 truncate text-xs font-semibold text-garage-dim">{copy.caption}</span>
      </div>
      <div
        ref={stripRef}
        className="garage-scroll-x relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0"
        aria-label={`${copy.title} — geser untuk melihat lainnya`}
      >
        {items.map((item, index) => {
          const qty = itemCartQty(item, cart);
          return (
            <article
              key={item.id}
              className="relative w-[86%] shrink-0 snap-start overflow-hidden rounded-lg border border-garage-line bg-garage-bg-2 sm:w-[440px]"
            >
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="block w-full cursor-pointer text-left"
                aria-label={`Lihat detail ${item.name}`}
              >
                <span className="relative block aspect-[16/9] w-full overflow-hidden bg-garage-bg-1">
                  <MenuPhoto item={item} iconClassName="size-10" eager={index === 0} placeholderAlign="top" />
                  <span
                    className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/55 to-transparent"
                    aria-hidden
                  />
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3.5 pr-16">
                    <span className="line-clamp-2 text-lg font-bold leading-snug text-white drop-shadow">
                      {item.name}
                    </span>
                    {item.description ? (
                      <span className="line-clamp-1 text-[13px] text-white/80">{item.description}</span>
                    ) : null}
                    <MenuPrice item={item} size="lg" />
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onQuickAdd(item)}
                className="garage-press absolute bottom-3.5 right-3.5 flex size-11 cursor-pointer items-center justify-center rounded-md bg-garage-red text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)] transition-colors hover:bg-garage-red-bright"
                aria-label={needsDetailSheet(item) ? `Pilih varian ${item.name}` : `Tambah ${item.name}`}
              >
                <Plus className="size-5" strokeWidth={2.5} />
                {qty > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-sm bg-white px-1 text-[11px] font-bold tabular-nums text-garage-bg-0">
                    {qty}
                  </span>
                ) : null}
              </button>
            </article>
          );
        })}
      </div>
      {items.length > 1 ? (
        <div className="mt-2 flex justify-center gap-0.5" aria-hidden>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              onClick={() => jumpTo(index)}
              className="flex h-5 cursor-pointer items-center px-1"
            >
              <span
                className={`block h-1.5 rounded-sm transition-all duration-200 ${
                  index === activeIndex ? "w-5 bg-garage-red" : "w-1.5 bg-garage-line-2"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
