import { describe, expect, it } from "vitest";

import { channelGroupOf } from "@/lib/payment-status";
import {
  isQuickRetailChannel,
  isQuickRetailProduct,
  matchQuickRetail,
  QUICK_RETAIL_CHANNEL,
  quickRetailItemsForTab,
  quickRetailTabs,
} from "@/lib/quick-retail";

const items = [
  {
    id: "mineral",
    name: "Air Mineral 600ml",
    sku: "MIN-600",
    barcode: null,
    variants: [
      { id: "btl", sku: "MIN-600-BTL", barcode: "8991234567890" },
      { id: "dus", sku: "MIN-600-DUS", barcode: "8991234567999" },
    ],
  },
  { id: "rokok", name: "Rokok Filter", sku: "RKK-01", barcode: "8990001112223", variants: [{ id: "bks", sku: null, barcode: null }] },
  { id: "keripik", name: "Keripik Kentang", sku: "SNK-01", barcode: null, variants: [{ id: "reg", sku: null, barcode: null }] },
];

describe("isQuickRetailProduct", () => {
  it("retail atau produk serah langsung saja", () => {
    expect(isQuickRetailProduct({ productType: "retail", category: "Snack" })).toBe(true);
    expect(isQuickRetailProduct({ productType: "menu", category: "Minuman Botol" })).toBe(true);
    expect(isQuickRetailProduct({ productType: "menu", category: "Coffee", station: "none" })).toBe(true);
    expect(isQuickRetailProduct({ productType: "menu", category: "Coffee" })).toBe(false);
    expect(isQuickRetailProduct({ productType: "bundle", category: "Makanan" })).toBe(false);
  });
});

describe("matchQuickRetail", () => {
  it("barcode varian = exact match ke varian itu", () => {
    const hit = matchQuickRetail(items, "8991234567999");
    expect(hit.exact?.item.id).toBe("mineral");
    expect(hit.exact?.variantId).toBe("dus");
  });

  it("SKU produk satu varian = exact", () => {
    expect(matchQuickRetail(items, "rkk-01").exact?.variantId).toBe("bks");
    expect(matchQuickRetail(items, "8990001112223").exact?.item.id).toBe("rokok");
  });

  it("SKU produk multi-varian tidak menebak varian", () => {
    const hit = matchQuickRetail(items, "MIN-600");
    expect(hit.exact).toBeNull();
    expect(hit.results.map((item) => item.id)).toEqual(["mineral"]);
  });

  it("pencarian nama per kata", () => {
    expect(matchQuickRetail(items, "keripik ken").results.map((item) => item.id)).toEqual(["keripik"]);
    expect(matchQuickRetail(items, "").results).toHaveLength(3);
  });
});

describe("kanal Penjualan Langsung", () => {
  it("dikelompokkan sendiri di laporan, bukan Dine-in kasir", () => {
    expect(isQuickRetailChannel(QUICK_RETAIL_CHANNEL)).toBe(true);
    expect(channelGroupOf({ orderSource: "pos", channel: QUICK_RETAIL_CHANNEL, fulfillment: null })).toBe("quick_retail");
    expect(channelGroupOf({ orderSource: "pos", channel: "Dine in", fulfillment: null })).toBe("pos_dine_in");
  });
});

describe("tab kategori & Favorit Penjualan Langsung", () => {
  const products = [
    { id: "aqua", name: "Aqua 600", category: "Minuman Botol" },
    { id: "teh", name: "Teh Botol", category: "Minuman Botol" },
    { id: "sampoerna", name: "Sampoerna Mild", category: "Rokok" },
  ];

  it("Favorit muncul hanya bila ada ketukan; kategori urut nama", () => {
    expect(quickRetailTabs(products, {})).toEqual(["Semua", "Minuman Botol", "Rokok"]);
    expect(quickRetailTabs(products, { teh: 2 })).toEqual(["Favorit", "Semua", "Minuman Botol", "Rokok"]);
  });

  it("isi tab: Favorit paling sering dulu, kategori sesuai, Semua lengkap", () => {
    const counts = { teh: 2, sampoerna: 5, lain: 9 };
    expect(quickRetailItemsForTab(products, "Favorit", counts).map((item) => item.id)).toEqual(["sampoerna", "teh"]);
    expect(quickRetailItemsForTab(products, "Rokok", counts).map((item) => item.id)).toEqual(["sampoerna"]);
    expect(quickRetailItemsForTab(products, "Semua", counts)).toHaveLength(3);
  });
});
