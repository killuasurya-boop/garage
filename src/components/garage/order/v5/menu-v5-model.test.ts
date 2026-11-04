import { describe, expect, it } from "vitest";

import type { MenuItem } from "@/lib/garage-api-types";

import { availableChips, cardBadge, cardPrice, categoryPhoto, filterByChip, variantSummary } from "./menu-v5-model";
import { restoreCart } from "./saved-cart";
import { toggleFavoriteIds } from "./use-menu-favorites";

function menu(partial: Partial<MenuItem> & Pick<MenuItem, "id" | "name">): MenuItem {
  return {
    category: "Coffee",
    section: "Kopi Susu",
    variants: [{ id: "regular", label: "Regular", price: 15000 }],
    stock: "ready",
    prep: "4m",
    tags: [],
    ...partial,
  } as MenuItem;
}

const americano = menu({ id: "a", name: "Americano", variants: [{ id: "hot", label: "Hot", price: 15000 }, { id: "cold", label: "Cold", price: 15000 }] });
const latte = menu({ id: "l", name: "Coffee Latte", variants: [{ id: "hot", label: "Hot", price: 18000 }, { id: "cold", label: "Cold", price: 20000 }], featured: true });
const choco = menu({ id: "c", name: "Choco Cloud", category: "Non-Coffee", variants: [{ id: "cold", label: "Cold", price: 26000 }], imageUrl: "/x.webp" });
const nasi = menu({ id: "n", name: "Nasi Goreng", category: "Makanan", stock: "limited" });
const habis = menu({ id: "h", name: "Habis", stock: "sold_out", featured: true });

describe("Menu V5 — aturan tampilan dari data", () => {
  it('harga "mulai" hanya bila harga varian berbeda', () => {
    expect(cardPrice(americano)).toEqual({ from: false, price: 15000, strike: null });
    expect(cardPrice(latte)).toEqual({ from: true, price: 18000, strike: null });
    const promo = menu({ id: "p", name: "Promo", promoActive: true, promoPrice: 12000 } as Partial<MenuItem> & { id: string; name: string });
    expect(cardPrice(promo)).toEqual({ from: false, price: 12000, strike: 15000 });
  });

  it("baris varian: Hot / Cold, Cold, atau kosong untuk Regular", () => {
    expect(variantSummary(americano)).toBe("Hot / Cold");
    expect(variantSummary(choco)).toBe("Cold");
    expect(variantSummary(nasi)).toBe("");
    const indomie = menu({ id: "i", name: "Indomie", variants: ["Telur", "Telur Keju", "Telur Ayam", "Telur Sosis", "Spesial"].map((label, i) => ({ id: `v${i}`, label, price: 12000 })) });
    expect(variantSummary(indomie)).toBe("5 pilihan");
  });

  it("satu badge per kartu; habis tanpa badge (pakai overlay)", () => {
    expect(cardBadge(latte, true)).toBe("signature");
    expect(cardBadge(americano, true)).toBe("best");
    expect(cardBadge(nasi, false)).toBe("limited");
    expect(cardBadge(habis, true)).toBeNull();
  });

  it("chip filter hanya muncul bila datanya ada (tanpa fitur palsu)", () => {
    const items = [americano, latte, choco, nasi];
    expect(availableChips(items, new Set(), [])).toEqual(["all", "signature"]);
    expect(availableChips(items, new Set(["a"]), ["c"])).toEqual(["all", "signature", "best", "favorite"]);
    expect(filterByChip(items, "best", new Set(["a"]), [])).toEqual([americano]);
    expect(filterByChip(items, "favorite", new Set(), ["c", "n"])).toEqual([choco, nasi]);
    expect(filterByChip(items, "all", new Set(), [])).toBe(items);
  });

  it("foto ubin kategori = menu pertama yang punya foto asli", () => {
    expect(categoryPhoto([americano, choco], "Non-Coffee")).toBe(choco);
    expect(categoryPhoto([americano, choco], "Coffee")).toBeNull();
  });

  it("favorit: ketuk lagi = hapus, terbaru di depan", () => {
    expect(toggleFavoriteIds([], "a")).toEqual(["a"]);
    expect(toggleFavoriteIds(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleFavoriteIds(["b", "a"], "b")).toEqual(["a"]);
  });

  it("Daftar Pilihan tersimpan dipulihkan hanya untuk menu & varian yang masih ada", () => {
    const menuNow = [americano, nasi, habis];
    const saved = {
      cart: { "a::cold": 2, "a::gone": 1, "n::regular": 1.5, "h::regular": 1, "event:x::b": 1, "zzz::regular": 3, "n::regular ": 1 },
      notes: { "a::cold": "less ice", "h::regular": "x" },
    };
    expect(restoreCart(saved, menuNow)).toEqual({ cart: { "a::cold": 2 }, notes: { "a::cold": "less ice" } });
    expect(restoreCart({ cart: { "a::hot": 500 } }, menuNow)?.cart).toEqual({ "a::hot": 99 });
    expect(restoreCart("rusak", menuNow)).toBeNull();
    expect(restoreCart({ cart: {} }, menuNow)).toBeNull();
  });
});
