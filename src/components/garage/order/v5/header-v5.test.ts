import { describe, expect, it } from "vitest";

import { isSearchShortcut } from "./header-v5";
import { heroPhotoItems } from "./hero-v5";
import { memberPointsLine } from "./layout-v5";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("pintasan cari navbar", () => {
  it("'/' membuka cari, kecuali sedang mengetik", () => {
    expect(isSearchShortcut(key("/"), false)).toBe(true);
    expect(isSearchShortcut(key("/"), true)).toBe(false);
  });
  it("Ctrl/⌘K selalu membuka cari", () => {
    expect(isSearchShortcut(key("k", { ctrlKey: true }), true)).toBe(true);
    expect(isSearchShortcut(key("K", { metaKey: true }), false)).toBe(true);
  });
  it("tombol lain diabaikan", () => {
    expect(isSearchShortcut(key("k"), false)).toBe(false);
    expect(isSearchShortcut(key("/", { altKey: true }), false)).toBe(false);
  });
});

describe("kalimat poin member", () => {
  it("dibulatkan & tidak mengarang", () => {
    expect(memberPointsLine(0.5)).toContain("1 poin tiap belanja Rp2.000");
    expect(memberPointsLine(2)).toContain("2 poin tiap belanja Rp1.000");
    expect(memberPointsLine(0)).not.toMatch(/poin tiap/);
  });
});

describe("foto panggung hero", () => {
  const item = (id: string, category: string, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, category, section: category, variants: [], stock: "ready", prep: "", tags: [], imageUrl: `/img/${id}.webp`, ...extra }) as never;
  it("pakai sorotan berfoto; bila kosong, minuman berfoto dulu; tanpa yang habis/tanpa foto", () => {
    expect(heroPhotoItems([item("a", "Makanan")], [item("b", "Coffee")]).map((x: { id: string }) => x.id)).toEqual(["a"]);
    const all = [item("m", "Makanan"), item("n", "Non-Coffee"), item("c", "Coffee"), item("h", "Coffee", { stock: "sold_out" }), item("x", "Coffee", { imageUrl: undefined })];
    expect(heroPhotoItems([item("y", "Coffee", { imageUrl: undefined })], all).map((x: { id: string }) => x.id)).toEqual(["c", "n", "m"]);
  });
});
