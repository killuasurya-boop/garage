import { describe, expect, it } from "vitest";

import { isShortcodeQuery, menuShortcodes, shortcodeMatchRank } from "./menu-shortcode";

describe("menuShortcodes", () => {
  it("memakai huruf depan tiap kata dan konsonan awal", () => {
    expect(menuShortcodes("Coffee Latte")).toEqual(["cl", "cflt"]);
    expect(menuShortcodes("Nasi Goreng")).toEqual(["ng", "nsgr"]);
    expect(menuShortcodes("Americano")).toEqual(["amr"]);
  });

  it("nama pendek tanpa konsonan cukup tetap punya kode", () => {
    expect(menuShortcodes("Sosis")).toEqual(["sos"]);
    expect(menuShortcodes("")).toEqual([]);
  });
});

describe("shortcodeMatchRank", () => {
  const latte = menuShortcodes("Coffee Latte");

  it("kode persis lebih tinggi dari awalan", () => {
    expect(shortcodeMatchRank("cl", latte)).toBe(2);
    expect(shortcodeMatchRank("cfl", latte)).toBe(1);
    expect(shortcodeMatchRank("xy", latte)).toBe(0);
  });

  it("hanya 2–4 huruf tanpa spasi yang dianggap kode", () => {
    expect(isShortcodeQuery("c")).toBe(false);
    expect(isShortcodeQuery("latte")).toBe(false);
    expect(isShortcodeQuery("c l")).toBe(false);
    expect(shortcodeMatchRank("c", latte)).toBe(0);
  });
});
