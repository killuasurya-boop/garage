"use client";

import { ChevronRight, Clock } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { PopularBadge, QuantityControl, StockBadge, itemMinPrice, rupiah } from "./order-ui";

// Baris menu ringkas (gaya aplikasi pesan-antar): info di kiri, aksi di kanan.
// Foto hanya tampil bila item punya imageUrl — tidak ada kotak placeholder kosong.
export function MenuRow({
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
  const hasBadges = (popular && !soldOut) || item.stock !== "ready";

  return (
    <article
      className={`flex items-stretch gap-3 border-b border-garage-line/70 py-4 last:border-b-0 ${
        soldOut ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={soldOut}
        className="group min-w-0 flex-1 cursor-pointer text-left disabled:cursor-not-allowed"
        aria-label={`Lihat detail ${item.name}`}
      >
        {hasBadges ? (
          <span className="mb-1.5 flex flex-wrap gap-1.5">
            {popular && !soldOut ? <PopularBadge /> : null}
            <StockBadge stock={item.stock} />
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-garage-fg transition-colors group-hover:text-white">
          {item.name}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-garage-dim">
          {multiVariant ? (
            <span>{item.variants.map((variant) => variant.label).join(" · ")}</span>
          ) : null}
          {multiVariant && item.prep ? <span aria-hidden>·</span> : null}
          {item.prep ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {item.prep.replace(/m$/, " mnt")}
            </span>
          ) : null}
        </p>
        <p className="mt-2 flex items-baseline gap-1.5">
          {multiVariant ? <span className="text-xs text-garage-dim">mulai</span> : null}
          <span className="font-mono text-base font-bold tabular-nums text-white">
            {rupiah.format(itemMinPrice(item))}
          </span>
          {cartQty > 0 && multiVariant ? (
            <span className="ml-1 rounded-sm bg-garage-red px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              {cartQty} di keranjang
            </span>
          ) : null}
        </p>
      </button>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {item.imageUrl ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={soldOut}
            className="relative size-20 cursor-pointer overflow-hidden rounded-md border border-garage-line bg-garage-bg-2 disabled:cursor-not-allowed sm:size-[88px]"
            aria-label={`Foto ${item.name}`}
          >
            {/* Foto menu dari URL bebas (di-set admin) — <img> biasa agar tidak terikat remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ) : (
          <span />
        )}
        {soldOut ? (
          <span className="inline-flex h-11 items-center rounded-md border border-garage-line-2 px-3 text-xs font-bold uppercase text-garage-dim">
            Habis
          </span>
        ) : multiVariant ? (
          <button
            type="button"
            onClick={onOpen}
            className="garage-press inline-flex h-11 cursor-pointer items-center gap-1 rounded-md border border-garage-red/70 bg-garage-red/10 pl-3 pr-2 text-sm font-bold text-white transition-colors hover:bg-garage-red/25"
            aria-label={`Pilih varian ${item.name}`}
          >
            Pilih <ChevronRight className="size-4" aria-hidden />
          </button>
        ) : (
          <QuantityControl
            compact
            label={item.name}
            qty={cartQty}
            onMinus={() => singleVariantId && onAdd(singleVariantId, -1)}
            onPlus={() => singleVariantId && onAdd(singleVariantId, 1)}
          />
        )}
      </div>
    </article>
  );
}

export function MenuRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-garage-line/70 py-4" aria-hidden>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="h-4 w-3/5 rounded-sm bg-white/10" />
        <div className="h-3 w-2/5 rounded-sm bg-white/10" />
        <div className="h-4 w-24 rounded-sm bg-white/10" />
      </div>
      <div className="size-11 rounded-md bg-white/10" />
    </div>
  );
}
