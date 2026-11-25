import { describe, expect, it } from "vitest";

import { menuShortcodes } from "@/lib/menu-shortcode";
import { filterReceipts, isBarcodeLike, parseQuantityQuery, searchMenuEntries } from "@/lib/pos-search";
import { isPosGlobalShortcut, POS_SHORTCUTS } from "@/lib/pos-shortcuts";

// Fase 2 "Kasir Lancar" (25 Nov 2026): kolom cari, sintaks qty, kode scanner, riwayat struk, pintasan.

const entry = (id: string, name: string, extra = "") => ({
  item: { id, name },
  searchIndex: `${name} ${extra}`.toLowerCase(),
  shortcodes: menuShortcodes(name),
});
const menu = [entry("latte", "Coffee Latte", "coffee"), entry("cola", "Coca Cola", "minuman botol 8991234567890"), entry("nasi", "Nasi Goreng", "makanan")];

describe("parseQuantityQuery", () => {
  it("3*cl, 3 * cl, 3x cl → qty 3", () => {
    for (const raw of ["3*cl", "3 * cl", "3x cl", "3×cl"]) expect(parseQuantityQuery(raw)).toEqual({ qty: 3, term: "cl" });
  });

  it("tanpa awalan qty atau angka saja (barcode) → qty 1, teks utuh", () => {
    expect(parseQuantityQuery("Coffee Latte")).toEqual({ qty: 1, term: "coffee latte" });
    expect(parseQuantityQuery("8991234567890")).toEqual({ qty: 1, term: "8991234567890" });
    expect(parseQuantityQuery("1000*x")).toEqual({ qty: 1, term: "1000*x" });
    expect(parseQuantityQuery("0*cl")).toEqual({ qty: 1, term: "0*cl" });
  });
});

describe("searchMenuEntries", () => {
  it("kode singkat persis paling depan, lalu cocok teks", () => {
    expect(searchMenuEntries(menu, "cl").map((item) => item.id)[0]).toBe("latte");
    expect(searchMenuEntries(menu, "goreng").map((item) => item.id)).toEqual(["nasi"]);
    expect(searchMenuEntries(menu, "").map((item) => item.id)).toEqual(["latte", "cola", "nasi"]);
  });

  it("filter accept dihormati", () => {
    expect(searchMenuEntries(menu, "", (e) => e.item.id !== "cola").map((item) => item.id)).toEqual(["latte", "nasi"]);
  });
});

describe("kode scanner", () => {
  it("≥ 8 digit = pola barcode", () => {
    expect(isBarcodeLike("8991234567890")).toBe(true);
    expect(isBarcodeLike("1234567")).toBe(false);
    expect(isBarcodeLike("cl")).toBe(false);
  });
});

describe("filterReceipts", () => {
  const receipts = [
    { orderNo: "POS-0101", invoiceNo: "INV-0101", tableLabel: "Meja 06", total: 45_000, customer: { name: "Budi", phone: "0812" } },
    { orderNo: "POS-0102", invoiceNo: "INV-0102", tableLabel: "Take away", total: 120_000, customer: { name: "Sari", phone: null } },
  ];
  it("cari no order, meja, nama, dan nominal", () => {
    expect(filterReceipts(receipts, "0102").map((r) => r.orderNo)).toEqual(["POS-0102"]);
    expect(filterReceipts(receipts, "meja 06").map((r) => r.orderNo)).toEqual(["POS-0101"]);
    expect(filterReceipts(receipts, "sari").map((r) => r.orderNo)).toEqual(["POS-0102"]);
    expect(filterReceipts(receipts, "Rp 45.000").map((r) => r.orderNo)).toEqual(["POS-0101"]);
    expect(filterReceipts(receipts, "")).toHaveLength(2);
  });
});

describe("pintasan POS", () => {
  it("tombol F lama tetap ada; F8 dan ? tambahan", () => {
    const keys = POS_SHORTCUTS.map((s) => s.key);
    for (const key of ["F1", "F2", "F3", "F4", "F6", "F8", "F9", "[", "?"]) expect(keys).toContain(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tidak mencegat ketikan atau kombinasi Ctrl/Alt", () => {
    expect(isPosGlobalShortcut({ key: "F9" }, true)).toBe(true);
    expect(isPosGlobalShortcut({ key: "?" }, true)).toBe(false);
    expect(isPosGlobalShortcut({ key: "?" }, false)).toBe(true);
    expect(isPosGlobalShortcut({ key: "[" }, true)).toBe(false);
    expect(isPosGlobalShortcut({ key: "F4", ctrlKey: true }, false)).toBe(false);
    expect(isPosGlobalShortcut({ key: "Enter" }, false)).toBe(false);
    expect(isPosGlobalShortcut({ key: "a" }, false)).toBe(false);
  });
});
