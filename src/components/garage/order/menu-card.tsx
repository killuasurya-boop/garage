"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

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

// Foto menu atau placeholder kategori (tanpa kotak kosong). Dipakai kartu grid, banner,
// detail sheet & panel admin. Foto muncul halus (fade-in) di atas latar shimmer, jadi
// tidak ada kedipan/lompatan saat gambar selesai dimuat.
export function MenuPhoto({
  item,
  className = "",
  iconClassName = "size-9",
  eager = false,
  placeholderAlign = "center",
  hideLabel = false,
}: {
  item: MenuItem;
  className?: string;
  iconClassName?: string;
  eager?: boolean;
  /** "top": ikon placeholder di pojok kanan atas (banner yang bawahnya tertutup teks). */
  placeholderAlign?: "center" | "top";
  /** Thumbnail kecil: tampilkan ikon saja tanpa nama kategori. */
  hideLabel?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = Boolean(item.imageUrl) && loadedSrc === item.imageUrl;

  // Gambar dari cache bisa selesai sebelum hydration (onLoad tidak terpanggil).
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0 && item.imageUrl) {
      setLoadedSrc(item.imageUrl);
    }
  }, [item.imageUrl]);

  if (item.imageUrl) {
    return (
      <span
        className={`relative block h-full w-full overflow-hidden ${loaded ? "bg-garage-bg-1" : "garage-photo-shimmer"}`}
      >
        {/* Foto menu dari URL bebas (di-set admin) — <img> biasa agar tidak terikat remotePatterns. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={item.imageUrl}
          alt={item.name}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoadedSrc(item.imageUrl ?? null)}
          className={`h-full w-full object-cover transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
            loaded ? "opacity-100" : "opacity-0"
          } ${className}`}
        />
      </span>
    );
  }
  if (placeholderAlign === "top") {
    // Banner: bagian bawah tertutup nama & harga → ikon kecil di pojok kanan atas saja.
    return (
      <span
        className={`flex h-full w-full items-start justify-end bg-[radial-gradient(circle_at_80%_20%,var(--garage-bg-3),var(--garage-bg-1))] p-4 ${className}`}
        aria-hidden
      >
        {categoryIcon(item.category, `${iconClassName} text-garage-amber/60`)}
      </span>
    );
  }
  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_50%_40%,var(--garage-bg-3),var(--garage-bg-1))] ${className}`}
      aria-hidden
    >
      {categoryIcon(item.category, `${iconClassName} text-garage-amber/70`)}
      {hideLabel ? null : (
        <span className="text-[11px] font-semibold tracking-wide text-garage-mute">{item.category}</span>
      )}
    </span>
  );
}

export function MenuPrice({ item, size = "base" }: { item: MenuItem; size?: "base" | "lg" }) {
  const promo = itemHasPromo(item);
  const multiVariant = item.variants.length > 1;
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {multiVariant ? <span className="text-xs font-medium text-garage-dim">mulai</span> : null}
      <span
        className={`font-mono font-bold tabular-nums ${size === "lg" ? "text-lg" : "text-base"} ${
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

// Satu badge per kartu supaya foto tetap bersih. Prioritas: Promo > Unggulan > Terlaris >
// Stok terbatas. (Habis punya overlay sendiri.)
function CardBadge({ item, popular }: { item: MenuItem; popular: boolean }) {
  if (item.stock === "sold_out") return null;
  if (item.tags.includes("Menu Event")) return <span className="rounded-md border border-garage-amber/40 bg-garage-bg-0 px-2 py-1 text-sm font-bold text-garage-amber">Harga event</span>;
  if (itemHasPromo(item)) return <PromoBadge />;
  if (item.featured) return <FeaturedBadge />;
  if (popular) return <PopularBadge />;
  if (item.stock === "limited") return <StockBadge stock={item.stock} />;
  return null;
}

// Baris kecil di bawah nama: deskripsi singkat (admin) → pilihan varian → kosong.
export function menuSubtitle(item: MenuItem) {
  if (item.description) return item.description;
  if (item.variants.length > 1) return item.variants.map((variant) => variant.label).join(" · ");
  return "";
}

// Kartu menu grid "Showroom": foto 1:1, satu badge di atas foto, tombol + merah di pojok
// foto. Varian tunggal → langsung tambah/stepper; multi-varian → buka sheet detail.
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
  const subtitle = menuSubtitle(item);

  return (
    <article
      className={`garage-menu-card group relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-garage-bg-2 transition-[border-color,transform] duration-200 motion-safe:hover:-translate-y-0.5 ${
        cartQty > 0 ? "border-garage-red/70" : "border-garage-line hover:border-garage-line-2"
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-garage-bg-1">
        <button
          type="button"
          onClick={onOpen}
          disabled={soldOut}
          className="block h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-garage-amber disabled:cursor-not-allowed"
          aria-label={`Lihat detail ${item.name}`}
        >
          <MenuPhoto
            item={item}
            className={`duration-300 motion-safe:group-hover:scale-[1.03] ${soldOut ? "grayscale" : ""}`}
          />
        </button>

        <span className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)]">
          <CardBadge item={item} popular={popular} />
        </span>

        {soldOut ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-garage-bg-0/55">
            <span className="rounded-md border border-garage-line-2 bg-garage-bg-0/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
              Habis
            </span>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={soldOut}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-garage-amber disabled:cursor-not-allowed sm:p-4"
      >
        <h3 className="min-h-[2.75em] break-words text-base font-bold leading-snug text-white">
          {item.name}
        </h3>
        {/* Selalu 1 baris (walau kosong) supaya tinggi kartu dalam satu baris grid sama. */}
        <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-garage-dim">{subtitle}</p>
        <span className="mt-auto pt-1">
          <MenuPrice item={item} />
        </span>
      </button>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        {multiVariant ? <button type="button" onClick={onOpen} disabled={soldOut} aria-label={`Pilih varian ${item.name}`} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-garage-line-2 bg-garage-bg-3 px-2 text-sm font-bold text-white transition-colors hover:border-garage-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garage-amber disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-4 shrink-0" aria-hidden />{soldOut ? "Tidak tersedia" : "Pilih varian"}{cartQty ? <span className="font-mono tabular-nums">({cartQty})</span> : null}</button> : <div className="[&>button]:w-full [&>div]:w-full [&>div>span]:flex-1"><QuantityControl label={item.name} qty={cartQty} disabled={soldOut} onMinus={() => singleVariantId && onAdd(singleVariantId, -1)} onPlus={() => singleVariantId && onAdd(singleVariantId, 1)} /></div>}
      </div>
    </article>
  );
}

export function MenuCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-garage-line bg-garage-bg-2" aria-hidden>
      <div className="garage-photo-shimmer aspect-square w-full" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded-sm bg-white/10" />
        <div className="h-3 w-2/5 rounded-sm bg-white/10" />
        <div className="h-4 w-1/2 rounded-sm bg-white/10" />
      </div>
    </div>
  );
}

export const MENU_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4";
