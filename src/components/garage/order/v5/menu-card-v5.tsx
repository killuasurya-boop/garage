"use client";

// Kartu menu V5 (papan 01 + layout): foto, badge, hati Favorit, nama, varian, harga, stepper − n +.
// - Varian tunggal → stepper langsung menambah/mengurangi.
// - Multi-varian → "+" (dan "−" bila sudah ada di daftar) membuka pilihan varian; angka = total semua varian.
// - Habis → foto abu-abu, badge "Sold Out", tombol mati.
// Data (nama, harga, varian, foto) selalu dari sistem.
import type { CSSProperties } from "react";
import { Crown, Flame, Heart, Minus, Plus, Star, TicketPercent, Timer, TrendingUp } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

import { MenuPhoto } from "../menu-card";
import { rupiah } from "../order-ui";
import { cardBadges, cardPrice, variantSummary, type CardBadge, type CardBadgeKind } from "./menu-v5-model";

function Badge({ kind }: { kind: CardBadge }) {
  switch (kind) {
    case "best":
      return <span className="gm5-badge gm5-badge-best"><TrendingUp className="size-3.5" aria-hidden />Best Seller</span>;
    case "signature":
      // Merah brand + mahkota: menu khas Garage (tag "Signature").
      return <span className="gm5-badge gm5-badge-signature"><Crown className="size-3.5" aria-hidden />Signature</span>;
    case "unggulan":
      // Amber/emas + bintang: rekomendasi yang diatur admin (featured).
      return <span className="gm5-badge gm5-badge-unggulan"><Star className="size-3.5" fill="currentColor" aria-hidden />Unggulan</span>;
    case "promo":
      return <span className="gm5-badge gm5-badge-promo"><TicketPercent className="size-3.5" aria-hidden />Promo</span>;
    case "limited":
      return <span className="gm5-badge gm5-badge-limited"><Timer className="size-3.5" aria-hidden />Limited</span>;
    case "event":
      return <span className="gm5-badge gm5-badge-promo"><Flame className="size-3.5" aria-hidden />Harga event</span>;
    default:
      return null;
  }
}

/** Maks. dua badge, membungkus ke baris baru di kartu sempit (tidak menutupi nama/harga). */
function BadgeRow({ kinds }: { kinds: CardBadgeKind[] }) {
  if (!kinds.length) return null;
  return (
    <span className="gm5-badge-row flex flex-wrap gap-1">
      {kinds.map((kind) => (
        <Badge key={kind} kind={kind} />
      ))}
    </span>
  );
}

function Price({ item, size }: { item: MenuItem; size: "md" | "lg" }) {
  const { from, price, strike } = cardPrice(item);
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
      {from ? <span className="text-xs font-semibold text-[#cfc9c4]">mulai</span> : null}
      <span className={`font-mono font-bold tabular-nums text-white ${size === "lg" ? "text-lg" : "text-base"}`}>{rupiah.format(price)}</span>
      {strike ? <span className="font-mono text-xs tabular-nums text-[#a7a09b] line-through">{rupiah.format(strike)}</span> : null}
    </span>
  );
}

export function Stepper({
  label,
  qty,
  soldOut,
  onMinus,
  onPlus,
  minusOpens = false,
}: {
  label: string;
  qty: number;
  soldOut: boolean;
  onMinus: () => void;
  onPlus: () => void;
  /** Multi-varian: "−" membuka pilihan varian, bukan mengurangi langsung. */
  minusOpens?: boolean;
}) {
  return (
    <span className="gm5-stepper" data-aya-anchor="add-item">
      <button type="button" className="gm5-step gm5-step-minus" onClick={onMinus} disabled={qty <= 0} aria-label={minusOpens ? `Ubah ${label}` : `Kurangi ${label}`}>
        <Minus className="size-4" strokeWidth={2.6} aria-hidden />
      </button>
      <span className="gm5-step-count" aria-label={`${qty} ${label} di Daftar Pilihan`}>{qty}</span>
      <button type="button" className="gm5-step gm5-step-plus" onClick={onPlus} disabled={soldOut} aria-label={soldOut ? `${label} habis` : `Tambah ${label}`}>
        <Plus className="size-4" strokeWidth={2.6} aria-hidden />
      </button>
    </span>
  );
}

export function MenuCardV5({
  item,
  cartQty,
  popular = false,
  favorite,
  onToggleFavorite,
  onAdd,
  onOpen,
  layout = "grid",
  index = 0,
}: {
  item: MenuItem;
  cartQty: number;
  popular?: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onAdd: (variantId: string, delta: number) => void;
  onOpen: () => void;
  layout?: "grid" | "list";
  /** Urutan untuk gerak masuk bertahap. */
  index?: number;
}) {
  const soldOut = item.stock === "sold_out";
  const multi = item.variants.length > 1;
  const single = item.variants[0]?.id;
  const summary = variantSummary(item);
  const badges = cardBadges(item, popular);
  const style = { ["--gm5-i" as string]: Math.min(index, 8) } as CSSProperties;

  const plus = () => (multi || !single ? onOpen() : onAdd(single, 1));
  const minus = () => (multi || !single ? onOpen() : onAdd(single, -1));

  const heart = (
    <button
      type="button"
      className="gm5-heart absolute right-2 top-2 z-10"
      aria-pressed={favorite}
      aria-label={favorite ? `Hapus ${item.name} dari Favorit` : `Simpan ${item.name} ke Favorit`}
      onClick={onToggleFavorite}
    >
      <Heart className="size-[18px]" fill={favorite ? "currentColor" : "none"} strokeWidth={2.2} aria-hidden />
    </button>
  );

  const photo = (
    <button type="button" onClick={onOpen} disabled={soldOut} aria-label={`Lihat detail ${item.name}`} className="block h-full w-full cursor-pointer disabled:cursor-not-allowed">
      <MenuPhoto item={item} hideLabel={layout === "list"} />
    </button>
  );

  if (layout === "list") {
    return (
      <article className="gm5-card gm5-rise flex-row gap-3 p-2.5" style={style} data-selected={cartQty > 0} data-sold-out={soldOut}>
        <div className="gm5-card-photo relative size-[104px] shrink-0 rounded-xl sm:size-[120px]">
          {photo}
          {soldOut ? <span className="gm5-badge gm5-badge-soldout absolute bottom-1.5 left-1.5">Sold Out</span> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pr-9">
          {badges.length ? <BadgeRow kinds={badges} /> : null}
          <h3 className="gm5-title break-words text-base leading-snug text-white">{item.name}</h3>
          {summary ? <p className="text-sm text-[#cfc9c4]">{summary}</p> : null}
          {item.description ? <p className="line-clamp-2 text-sm leading-5 text-[#a7a09b]">{item.description}</p> : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <Price item={item} size="md" />
            <Stepper label={item.name} qty={cartQty} soldOut={soldOut} onMinus={minus} onPlus={plus} minusOpens={multi} />
          </div>
        </div>
        {heart}
      </article>
    );
  }

  return (
    <article className="gm5-card gm5-rise flex-col" style={style} data-selected={cartQty > 0} data-sold-out={soldOut}>
      <div className="gm5-card-photo relative aspect-[4/3] w-full">
        {photo}
        <span className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)]">
          {soldOut ? <span className="gm5-badge gm5-badge-soldout">Sold Out</span> : <BadgeRow kinds={badges} />}
        </span>
        {heart}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="gm5-title break-words text-[15px] leading-snug text-white sm:text-base">{item.name}</h3>
        {summary ? <p className="text-sm leading-5 text-[#cfc9c4]">{summary}</p> : null}
        <span className="mt-auto flex flex-col gap-2 pt-1.5">
          <Price item={item} size="md" />
          <span className="flex justify-center">
            <Stepper label={item.name} qty={cartQty} soldOut={soldOut} onMinus={minus} onPlus={plus} minusOpens={multi} />
          </span>
        </span>
      </div>
    </article>
  );
}

export const MENU_GRID_V5 = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4";
export const MENU_LIST_V5 = "grid grid-cols-1 gap-3 md:grid-cols-2";
