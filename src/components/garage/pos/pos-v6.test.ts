// POS V6 — tema, preferensi Theme Studio, dan kontras token (WCAG AA) keempat tema.
// Token dibaca langsung dari src/app/globals.css supaya uji ini ikut gagal bila warna diubah.
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cashierThemePresets, DEFAULT_CASHIER_THEME, isCashierThemeMode, normalizeCashierTheme } from "../garage-app-pickers";
import { defaultCashierPosSettings, loadCashierPosSettings } from "../garage-app-helpers";

const THEMES = ["garage-signature", "garage-clear", "warm-light", "focus-blue", "garage-default"] as const;

function tokensFor(theme: string) {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(css))) {
    // Hanya blok tema itu sendiri (tanpa selektor turunan).
    const parts = match[1].split(",").map((part) => part.trim());
    if (!parts.includes(`.garage-shell[data-cashier-theme="${theme}"]`)) continue;
    for (const decl of match[2].matchAll(/(--pos-[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[decl[1]] = decl[2].trim();
  }
  return tokens;
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Warna pertama di nilai token (gradien → stop pertama). */
function firstHex(value: string) {
  const hex = value.match(/#[0-9a-fA-F]{6}/)?.[0];
  if (!hex) throw new Error(`token tanpa hex: ${value}`);
  return hex;
}

describe("POS V6 — tema kasir", () => {
  it("empat tema V6 + Garage Dark klasik, unik, Signature = utama", () => {
    expect(cashierThemePresets.map((preset) => preset.value)).toEqual([...THEMES]);
    expect(cashierThemePresets.map((preset) => preset.label)).toEqual(["Garage Signature", "Garage Clear", "Warm Coffee", "Focus Blue", "Garage Dark"]);
    expect(DEFAULT_CASHIER_THEME).toBe("garage-signature");
  });

  it("tidak dikenal/kosong → Garage Signature; gelap klasik tetap gelap", () => {
    expect(normalizeCashierTheme("garage-default")).toBe("garage-default");
    expect(normalizeCashierTheme(null)).toBe("garage-signature");
    expect(normalizeCashierTheme("neon")).toBe("garage-signature");
    expect(normalizeCashierTheme("warm-light")).toBe("warm-light");
    expect(isCashierThemeMode("garage-default")).toBe(true);
  });

  for (const theme of THEMES) {
    it(`${theme}: token lengkap & kontras AA (teks, harga, tombol, chrome)`, () => {
      const t = tokensFor(theme);
      for (const key of ["--pos-accent", "--pos-accent-fg", "--pos-surface", "--pos-bg", "--pos-text", "--pos-muted", "--pos-price", "--pos-chrome-fg", "--pos-chrome-solid", "--pos-border", "--pos-success", "--pos-total-bg"]) {
        expect(t[key], `${theme} ${key}`).toBeTruthy();
      }
      const surface = firstHex(t["--pos-surface"]);
      expect(contrast(firstHex(t["--pos-text"]), surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(firstHex(t["--pos-text"]), firstHex(t["--pos-bg"]))).toBeGreaterThanOrEqual(7);
      expect(contrast(firstHex(t["--pos-muted"]), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(firstHex(t["--pos-price"]), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(firstHex(t["--pos-accent-fg"]), firstHex(t["--pos-accent"]))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(firstHex(t["--pos-chrome-fg"]), firstHex(t["--pos-chrome-solid"]))).toBeGreaterThanOrEqual(7);
      // Total tagihan (aksen) di atas kotak total
      expect(contrast(firstHex(t["--pos-total-fg"] ?? t["--pos-accent"]), firstHex(t["--pos-total-bg"]))).toBeGreaterThanOrEqual(4.5);
      // Status sukses (kembalian) tetap terbaca di permukaan
      expect(contrast(firstHex(t["--pos-success"]), firstHex(t["--pos-success-soft"]))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("POS V6 — preferensi Theme Studio", () => {
  afterEach(() => vi.unstubAllGlobals());

  function withStorage(value: unknown) {
    const store = new Map<string, string>([["garage-cashier-pos-settings", JSON.stringify(value)]]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? (key.includes("cashier") ? JSON.stringify(value) : null),
      setItem: (key: string, v: string) => store.set(key, v),
    });
  }

  it("default V6: katalog visual, foto nyala, sidebar penuh, gerak normal", () => {
    expect(defaultCashierPosSettings).toMatchObject({ productView: "visual", showPhotos: true, sidebarMode: "full", reducedMotion: false, textSize: "normal" });
  });

  it("nilai tersimpan divalidasi; nilai asing kembali ke default", () => {
    withStorage({ textSize: "small", productView: "list", showPhotos: false, sidebarMode: "compact", reducedMotion: true });
    expect(loadCashierPosSettings()).toMatchObject({ textSize: "small", productView: "list", showPhotos: false, sidebarMode: "compact", reducedMotion: true });
    withStorage({ textSize: "huge", productView: "3d", showPhotos: "no", sidebarMode: "x", reducedMotion: "yes" });
    expect(loadCashierPosSettings()).toMatchObject({ textSize: "normal", productView: "visual", showPhotos: true, sidebarMode: "full", reducedMotion: false });
  });
});

import { contrastRatio, customThemeIssues, onColor, sanitizeThemeCustom, themeCustomCss } from "./pos-v6-theme-custom";

describe("POS V6 — warna lanjutan Owner/Manajer", () => {
  it("hanya hex & radius 8–20 yang diterima", () => {
    expect(sanitizeThemeCustom({ primary: "#B5121B", surface: "red", radius: 99, background: "#fff" })).toEqual({ primary: "#b5121b", radius: 20 });
    expect(sanitizeThemeCustom(null)).toEqual({});
  });

  it("kontras kurang = ditolak, aman = diterima", () => {
    expect(customThemeIssues({ primary: "#b5121b", surface: "#ffffff", background: "#f8f6f4" })).toEqual([]);
    expect(customThemeIssues({ surface: "#333333" }).length).toBeGreaterThan(0);
    expect(customThemeIssues({ primary: "#ffe0e0", surface: "#ffffff" }).length).toBeGreaterThan(0);
  });

  it("teks tombol otomatis putih/gelap sesuai warna utama; CSS hanya untuk tema terang", () => {
    expect(onColor("#b5121b")).toBe("#ffffff");
    expect(onColor("#f5c451")).toBe("#1a1a1a");
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    const css = themeCustomCss({ primary: "#1f5fd1", radius: 10 });
    expect(css).toContain("--pos-accent:#1f5fd1 !important");
    expect(css).toContain("--pos-radius:10px");
    expect(css).toContain(':not([data-cashier-theme="garage-default"])');
    expect(themeCustomCss({})).toBe("");
  });
});
