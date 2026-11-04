// Aturan tampilan Menu V5 yang murni (tanpa React) — dipakai kartu, hero, ubin & filter, dan diuji di
// menu-v5-model.test.ts. Semua teks dan angka berasal dari data menu, tidak pernah dari gambar referensi.
import { menuGroupForCategory, type MenuItem } from "@/lib/garage-api-types";

import { itemHasPromo, itemMinBasePrice, itemMinPrice, variantPrice } from "../order-ui";

/** Contoh catatan yang cocok dengan jenis menu (minuman ≠ makanan). */
export function notePlaceholder(item: Pick<MenuItem, "category" | "menuGroup">) {
  const group = menuGroupForCategory(item.category, item.menuGroup);
  if (group === "Bar") return "Contoh: less sugar, tanpa es, extra shot…";
  if (group === "Dapur") return "Contoh: tidak pedas, tanpa sayur, sambal pisah…";
  return "Contoh: yang dingin, tanpa sedotan…";
}

/** Label tombol utama hero sesuai mode outlet: pesan sendiri & buka → "Pesan Sekarang". */
export function heroCtaLabel({ waiterList, orderingOpen, staff = false }: { waiterList: boolean; orderingOpen: boolean; staff?: boolean }) {
  if (waiterList) return "Pilih Menu";
  if (staff) return "Pesankan Menu";
  return orderingOpen ? "Pesan Sekarang" : "Lihat Menu";
}

export type MenuChip = "all" | "signature" | "best" | "promo" | "favorite";

export const CHIP_LABEL: Record<MenuChip, string> = {
  all: "Semua",
  signature: "Signature",
  best: "Best Seller",
  promo: "Promo",
  favorite: "Favorit Saya",
};

/** Harga kartu: "mulai" hanya bila harga varian berbeda (keputusan Owner 4 Nov 2026). */
export function cardPrice(item: MenuItem): { from: boolean; price: number; strike: number | null } {
  const prices = new Set(item.variants.map((variant) => variantPrice(item, variant)));
  const price = itemMinPrice(item);
  return {
    from: prices.size > 1,
    price,
    strike: itemHasPromo(item) ? itemMinBasePrice(item) : null,
  };
}

const PLAIN_VARIANT = /^(regular|reguler|biasa|default|all)$/i;

/** Baris kecil di bawah nama: "Hot / Cold", "Cold", "8 pilihan", atau kosong untuk varian tunggal "Regular". */
export function variantSummary(item: MenuItem): string {
  const labels = item.variants.map((variant) => variant.label.trim()).filter(Boolean);
  // Banyak varian (mis. Indomie 8 pilihan) → ringkas supaya kartu tidak memanjang; detail di pilihan varian.
  if (labels.length > 3) return `${labels.length} pilihan`;
  if (labels.length > 1) return labels.join(" / ");
  if (labels.length === 1 && !PLAIN_VARIANT.test(labels[0])) return labels[0];
  return "";
}

export type CardBadge = "promo" | "signature" | "best" | "limited" | "event" | null;

/** Satu badge per kartu (foto tetap bersih). Habis memakai overlay sendiri. */
export function cardBadge(item: MenuItem, popular: boolean): CardBadge {
  if (item.stock === "sold_out") return null;
  if (item.tags.includes("Menu Event")) return "event";
  if (itemHasPromo(item)) return "promo";
  if (item.featured) return "signature";
  if (popular) return "best";
  if (item.stock === "limited") return "limited";
  return null;
}

/** Filter chip: hanya chip yang punya data yang ditampilkan (tanpa chip kosong / fitur palsu). */
export function availableChips(items: MenuItem[], bestSellerIds: ReadonlySet<string>, favoriteIds: readonly string[]): MenuChip[] {
  const chips: MenuChip[] = ["all"];
  if (items.some((item) => item.featured)) chips.push("signature");
  if (items.some((item) => bestSellerIds.has(item.id))) chips.push("best");
  if (items.some(itemHasPromo)) chips.push("promo");
  if (favoriteIds.length) chips.push("favorite");
  return chips;
}

export function filterByChip(
  items: MenuItem[],
  chip: MenuChip,
  bestSellerIds: ReadonlySet<string>,
  favoriteIds: readonly string[],
): MenuItem[] {
  switch (chip) {
    case "signature":
      return items.filter((item) => item.featured);
    case "best":
      return items.filter((item) => bestSellerIds.has(item.id));
    case "promo":
      return items.filter(itemHasPromo);
    case "favorite":
      return items.filter((item) => favoriteIds.includes(item.id));
    default:
      return items;
  }
}

/** Foto perwakilan kategori untuk ubin desktop: menu pertama yang punya foto asli. */
export function categoryPhoto(items: MenuItem[], category: string): MenuItem | null {
  return items.find((item) => item.category === category && Boolean(item.imageUrl)) ?? null;
}
