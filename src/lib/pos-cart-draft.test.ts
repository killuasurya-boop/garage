import { describe, expect, it } from "vitest";

import {
  POS_CART_DRAFT_KEY,
  POS_CART_DRAFT_MAX_AGE_MS,
  loadCartDraft,
  restorableCartLines,
  saveCartDraft,
} from "@/lib/pos-cart-draft";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const cart = [
  { itemId: "bar-001", variantId: "cold", qty: 2, note: "less ice" },
  { itemId: "food-01", variantId: "reg", qty: 1 },
];

describe("draf keranjang POS", () => {
  it("simpan lalu pulihkan item, jenis pesanan, dan meja", () => {
    const storage = memoryStorage();
    saveCartDraft({ cart, orderType: "takeaway", tableNumber: "" }, storage, 1_000);
    expect(loadCartDraft(storage, 2_000)).toEqual({ cart, orderType: "takeaway", tableNumber: "", savedAt: 1_000 });
  });

  it("tidak menyimpan data pelanggan", () => {
    const storage = memoryStorage();
    saveCartDraft({ cart, orderType: "dine-in", tableNumber: "7", guestPhone: "0812" } as never, storage, 1_000);
    const raw = JSON.parse(storage.map.get(POS_CART_DRAFT_KEY) ?? "{}");
    expect(Object.keys(raw).sort()).toEqual(["cart", "orderType", "savedAt", "tableNumber"]);
  });

  it("keranjang kosong menghapus draf", () => {
    const storage = memoryStorage();
    saveCartDraft({ cart, orderType: "dine-in", tableNumber: "3" }, storage, 1_000);
    saveCartDraft({ cart: [], orderType: "dine-in", tableNumber: "3" }, storage, 2_000);
    expect(storage.map.has(POS_CART_DRAFT_KEY)).toBe(false);
  });

  it("draf basi dibuang", () => {
    const storage = memoryStorage();
    saveCartDraft({ cart, orderType: "dine-in", tableNumber: "3" }, storage, 1_000);
    expect(loadCartDraft(storage, 1_000 + POS_CART_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.map.has(POS_CART_DRAFT_KEY)).toBe(false);
  });

  it("isi rusak/diubah manual tidak membuat POS error", () => {
    const storage = memoryStorage();
    storage.setItem(POS_CART_DRAFT_KEY, "{bukan json");
    expect(loadCartDraft(storage, 1)).toBeNull();
    storage.setItem(
      POS_CART_DRAFT_KEY,
      JSON.stringify({ savedAt: 1, orderType: "hack", tableNumber: 5, cart: [{ itemId: "a", variantId: "b", qty: 5000 }, { qty: 1 }, null] }),
    );
    expect(loadCartDraft(storage, 2)).toEqual({
      cart: [{ itemId: "a", variantId: "b", qty: 99 }],
      orderType: "dine-in",
      tableNumber: "",
      savedAt: 1,
    });
  });

  it("baris yang produk/variannya sudah tidak ada dibuang saat pulih", () => {
    const menu = new Map([["bar-001", { variants: [{ id: "cold" }, { id: "hot" }] }]]);
    expect(restorableCartLines(cart, menu)).toEqual([cart[0]]);
  });

  it("tanpa storage (mode privat/diblokir) tidak melempar error", () => {
    expect(() => saveCartDraft({ cart, orderType: "dine-in", tableNumber: "" }, null)).not.toThrow();
    expect(loadCartDraft(null)).toBeNull();
  });
});
