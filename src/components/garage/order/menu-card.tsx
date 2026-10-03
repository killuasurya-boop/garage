"use client";

import { ChevronRight, Clock, Plus } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import {
  FeaturedBadge,
  PopularBadge,
  PromoBadge,
  QuantityControl,
  StockBadge,
  categoryIcon,
  itemHasPromo,
  itemMinBasePrice,
  itemMinPrice,
  rupiah,
} from "./order-ui";

// Foto menu atau placeholder kategori (tanpa kotak kosong). Dipakai kartu grid & banner.
export function MenuPhoto({
  item,
  className = "",
  iconClassName = "size-10",
  eager = false,
}: {
  item: MenuItem;
  className?: string;
  iconClassName?: string;
  eager?: boolean;
}) {
  if (item.imageUrl) {
    return (
      // Foto menu dari URL bebas (di-set admin) — <img> biasa agar tidak terikat remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt={item.name}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_35%,var(--garage-bg-3),var(--garage-bg-1))] ${className}`}
      aria-hidden
    >
      {categoryIcon(item.category, `${iconClassName} text-garage-amber/80`)}
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-garage-dim">
        {item.category}
      </span>
    </span>
  );
}

export function MenuPrice({ item, size = "base" }: { item: MenuItem; size?: "base" | "lg" }) {
  const promo = itemHasPromo(item);
  const multiVariant = item.variants.length > 1;
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {multiVariant ? <span className="text-xs text-garage-dim">mulai</span> : null}
      <span
        className={`font-mono font-bold tabular-nums ${size === "lg" ? "text-lg" : "text-[15px]"} ${
          promo ? "text-[#ff8a8a]" : "text-white"
        }`}
      >
        {rupiah.format(itemMinPrice(item))}
      </span>
      {promo ? (
        <span className="font-mono text-xs tabular-nums text-garage-mute line-through">
          {rupiah.format(itemMinBasePrice(item))}
        </span>
      ) : null}
    </span>
  );
}

// Kartu menu grid "Showroom": foto 1:1, badge di atas foto, tombol + merah di pojok foto.
// Varian tunggal → langsung tambah/stepper; multi-varian → buka sheet detail.
export function MenuCard({
  item,
  cartQty,
  popular = false,
  onAdd,
  onOpen,
}: {
  item: MenuItem;
  cartQty: number;
  popular?: boolean;
  onAdd: (variantId: string, delta: number) => void;
  onOpen: () => void;
}) {
  const soldOut = item.stock === "sold_out";
  const multiVariant = item.variants.length > 1;
  const singleVariantId = item.variants[0]?.id;
  const promo = itemHasPromo(item);

  return (
    <article
      className={`garage-menu-card group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-garage-bg-2 transition-[border-color,transform] duration-200 motion-safe:hover:-translate-y-0.5 ${
        cartQty > 0 ? "border-garage-red/70" : "border-garage-line hover:border-garage-line-2"
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-garage-bg-1">
        <button
          type="button"
          onClick={onOpen}
          disabled={soldOut}
          className="block h-full w-full cursor-pointer disabled:cursor-not-allowed"
          aria-label={`Lihat detail ${item.name}`}
        >
          <MenuPhoto
            item={item}
            className={`transition-transform duration-300 motion-safe:group-hover:scale-[1.03] ${
              soldOut ? "grayscale" : ""
            }`}
          />
        </button>

        <span className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
          {promo && !soldOut ? <PromoBadge /> : null}
          {item.featured && !soldOut && !promo ? <FeaturedBadge /> : null}
          {popular && !soldOut && !promo && !item.featured ? <PopularBadge /> : null}
          {item.stock === "limited" ? <StockBadge stock={item.stock} /> : null}
        </span>

        {soldOut ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-garage-bg-0/55">
            <span className="rounded-md border border-garage-line-2 bg-garage-bg-0/90 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest text-white">
              Habis
            </span>
          </span>
        ) : multiVariant ? (
          <button
            type="button"
            onClick={onOpen}
            className="garage-press absolute bottom-2 right-2 flex size-11 cursor-pointer items-center justify-center rounded-md bg-garage-red text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-colors hover:bg-garage-red-bright"
            aria-label={`Pilih varian ${item.name}`}
          >
            <Plus className="size-5" strokeWidth={2.5} />
            {cartQty > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-sm bg-white px-1 text-[11px] font-bold tabular-nums text-garage-bg-0">
                {cartQty}
              </span>
            ) : null}
          </button>
        ) : (
          <span className="absolute bottom-2 right-2 rounded-md bg-garage-bg-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
            <QuantityControl
              compact
              label={item.name}
              qty={cartQty}
              onMinus={() => singleVariantId && onAdd(singleVariantId, -1)}
              onPlus={() => singleVariantId && onAdd(singleVariantId, 1)}
            />
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={soldOut}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 p-2.5 text-left disabled:cursor-not-allowed sm:p-3"
      >
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-bold leading-snug text-garage-fg sm:text-[15px]">
          {item.name}
        </h3>
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-garage-dim">
          {multiVariant ? (
            <>
              <span className="truncate">{item.variants.map((variant) => variant.label).join(" · ")}</span>
              <ChevronRight className="size-3 shrink-0" aria-hidden />
            </>
          ) : item.prep ? (
            <>
              <Clock className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{item.prep.replace(/m$/, " mnt")}</span>
            </>
          ) : (
            <span className="truncate">{item.section}</span>
          )}
        </span>
        <span className="mt-auto pt-0.5">
          <MenuPrice item={item} />
        </span>
      </button>
    </article>
  );
}

export function MenuCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-lg border border-garage-line bg-garage-bg-2" aria-hidden>
      <div className="aspect-square w-full bg-white/[0.06]" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded-sm bg-white/10" />
        <div className="h-3 w-2/5 rounded-sm bg-white/10" />
        <div className="h-4 w-1/2 rounded-sm bg-white/10" />
      </div>
    </div>
  );
}

export const MENU_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4";
