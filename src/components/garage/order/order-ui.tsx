"use client";

import { Coffee, Cookie, CupSoda, Flame, Minus, Plus, Star, UtensilsCrossed } from "lucide-react";

import type { MenuItem } from "@/lib/garage-api-types";

// Primitif UI menu digital (/order): format harga, stepper qty, badge status.
// Semua warna lewat token Garage (bg-garage-*, text-garage-*), bukan hex literal.

export const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

// Kunci baris keranjang: item::varian[::addon1+addon2]. Add-on diurutkan supaya pilihan
// yang sama selalu jadi baris yang sama.
export function cartKey(itemId: string, variantId: string, addonIds: string[] = []) {
  const addons = [...new Set(addonIds)].sort().join("+");
  return addons ? `${itemId}::${variantId}::${addons}` : `${itemId}::${variantId}`;
}

export function parseCartKey(key: string) {
  const [itemId = "", variantId = "", addons = ""] = key.split("::");
  return { itemId, variantId, addonIds: addons ? addons.split("+") : [] };
}

export type MenuAddon = NonNullable<MenuItem["addons"]>[number];

// Add-on terpilih yang masih ada di menu (pilihan yang sudah dihapus admin diabaikan).
export function resolveAddons(item: MenuItem, addonIds: string[]): MenuAddon[] {
  return addonIds
    .map((id) => item.addons?.find((addon) => addon.id === id))
    .filter((addon): addon is MenuAddon => Boolean(addon));
}

// Harga per porsi = harga efektif varian (promo) + total add-on. Sama dengan server.
export function lineUnitPrice(item: MenuItem, variant: MenuItem["variants"][number], addons: MenuAddon[]) {
  return variantPrice(item, variant) + addons.reduce((sum, addon) => sum + addon.price, 0);
}

// Harga efektif varian — SAMA dengan server (effectiveMenuPrice di garage-service):
// promo per produk aktif bila promoPrice > 0 dan lebih murah dari harga varian.
export function variantPrice(item: MenuItem, variant: MenuItem["variants"][number]) {
  const promo = item.promoPrice;
  if (item.promoActive && promo != null && promo > 0 && promo < variant.price) return promo;
  return variant.price;
}

export function itemHasPromo(item: MenuItem) {
  return item.variants.some((variant) => variantPrice(item, variant) < variant.price);
}

export function itemMinPrice(item: MenuItem) {
  return Math.min(...item.variants.map((variant) => variantPrice(item, variant)));
}

// Harga normal termurah (untuk harga coret saat promo).
export function itemMinBasePrice(item: MenuItem) {
  return Math.min(...item.variants.map((variant) => variant.price));
}

// Total porsi item di keranjang (semua varian & kombinasi add-on).
export function itemCartQty(item: MenuItem, cart: Record<string, number>) {
  const prefix = `${item.id}::`;
  return Object.entries(cart).reduce((sum, [key, qty]) => (key.startsWith(prefix) ? sum + qty : sum), 0);
}

export function categoryIcon(category: string, className: string) {
  if (category === "Coffee") return <Coffee strokeWidth={1.75} className={className} aria-hidden />;
  if (category === "Non-Coffee") return <CupSoda strokeWidth={1.75} className={className} aria-hidden />;
  if (category === "Cemilan") return <Cookie strokeWidth={1.75} className={className} aria-hidden />;
  return <UtensilsCrossed strokeWidth={1.75} className={className} aria-hidden />;
}

export function QuantityControl({
  label,
  qty,
  onMinus,
  onPlus,
  disabled = false,
  compact = false,
}: {
  label: string;
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  /** Saat qty 0: tombol "+" kotak 44px (daftar menu), bukan tombol "Tambah" berlabel. */
  compact?: boolean;
}) {
  if (qty <= 0) {
    return (
      <button
        type="button"
        className={`garage-press inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-garage-red text-sm font-bold text-white transition-colors hover:bg-garage-red-bright disabled:cursor-not-allowed disabled:bg-garage-bg-3 disabled:text-garage-mute ${
          compact ? "w-11" : "min-w-[104px] px-4"
        }`}
        aria-label={`Tambah ${label}`}
        disabled={disabled}
        onClick={onPlus}
      >
        <Plus className="size-4" strokeWidth={2.5} />
        {compact ? null : disabled ? "Habis" : "Tambah"}
      </button>
    );
  }

  return (
    <div className="inline-flex h-11 shrink-0 items-center overflow-hidden rounded-md border border-garage-red/60 bg-garage-red/10">
      <button
        type="button"
        className="garage-press flex size-11 cursor-pointer items-center justify-center text-white transition-colors hover:bg-garage-red/20"
        aria-label={`Kurangi ${label}`}
        onClick={onMinus}
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span
        className="garage-mono flex min-w-8 items-center justify-center text-center text-sm font-bold tabular-nums text-white"
        aria-live="polite"
      >
        {qty}
      </span>
      <button
        type="button"
        className="garage-press flex size-11 cursor-pointer items-center justify-center text-white transition-colors hover:bg-garage-red/20 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`Tambah ${label}`}
        disabled={disabled}
        onClick={onPlus}
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function PopularBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-garage-amber/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-garage-amber">
      <Flame className="size-3" aria-hidden /> Terlaris
    </span>
  );
}

export function StockBadge({ stock }: { stock: MenuItem["stock"] }) {
  if (stock === "sold_out") {
    return (
      <span className="inline-flex items-center rounded-sm border border-garage-line-2 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-garage-dim">
        Habis
      </span>
    );
  }
  if (stock === "limited") {
    return (
      <span className="inline-flex items-center rounded-sm bg-garage-red/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#ffb3b3]">
        Stok terbatas
      </span>
    );
  }
  return null;
}

export function PromoBadge() {
  return (
    <span className="inline-flex items-center rounded-sm bg-garage-red px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
      Promo
    </span>
  );
}

export function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-garage-amber px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-garage-bg-0">
      <Star className="size-3" aria-hidden /> Unggulan
    </span>
  );
}
