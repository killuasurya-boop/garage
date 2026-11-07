// POS V6 Theme Studio — pengaturan lanjutan Owner/Manajer (per perangkat, hanya tampilan).
// Override token --pos-* di atas tema aktif. Nilai yang gagal kontras AA tidak boleh diterapkan
// (validasi murni di `customThemeIssues`, diuji di pos-v6.test.ts).

export type PosThemeCustom = {
  primary?: string;
  background?: string;
  surface?: string;
  border?: string;
  /** Radius kartu/panel dalam px (8–20). */
  radius?: number;
};

export const POS_THEME_CUSTOM_KEY = "garage:pos:theme-custom:v1";
const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string) {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Teks di atas warna utama: putih bila cukup kontras, selain itu gelap. */
export function onColor(hex: string) {
  return contrastRatio("#ffffff", hex) >= 4.5 ? "#ffffff" : "#1a1a1a";
}

export function sanitizeThemeCustom(value: unknown): PosThemeCustom {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: PosThemeCustom = {};
  for (const key of ["primary", "background", "surface", "border"] as const) {
    if (typeof v[key] === "string" && HEX.test(v[key] as string)) out[key] = (v[key] as string).toLowerCase();
  }
  if (typeof v.radius === "number" && Number.isFinite(v.radius)) out.radius = Math.min(20, Math.max(8, Math.round(v.radius)));
  return out;
}

/** Masalah kontras (kosong = aman diterapkan). Teks tema terang diasumsikan gelap (#211b1c). */
export function customThemeIssues(custom: PosThemeCustom, textColor = "#211b1c"): string[] {
  const issues: string[] = [];
  if (custom.primary) {
    if (contrastRatio(onColor(custom.primary), custom.primary) < 4.5) issues.push("Warna utama: teks tombol tidak cukup kontras.");
    if (custom.surface && contrastRatio(custom.primary, custom.surface) < 3) issues.push("Warna utama terlalu mirip dengan permukaan kartu.");
  }
  if (custom.surface && contrastRatio(textColor, custom.surface) < 7) issues.push("Permukaan: teks utama kurang kontras (butuh latar terang).");
  if (custom.background && contrastRatio(textColor, custom.background) < 7) issues.push("Latar: teks utama kurang kontras (butuh latar terang).");
  return issues;
}

export function themeCustomCss(custom: PosThemeCustom) {
  const decl: string[] = [];
  if (custom.primary) {
    decl.push(`--pos-accent:${custom.primary}`, `--pos-accent-hover:${custom.primary}`, `--pos-accent-fg:${onColor(custom.primary)}`);
    decl.push(`--pos-accent-soft:color-mix(in srgb, ${custom.primary} 12%, #ffffff)`, `--pos-price:${custom.primary}`);
    decl.push(`--pos-total-bg:color-mix(in srgb, ${custom.primary} 10%, #ffffff)`, `--pos-total-fg:${custom.primary}`);
    decl.push(`--pos-chrome-active-bg:${custom.primary}`, `--cashier-button:${custom.primary}`, `--cashier-button-text:${onColor(custom.primary)}`);
  }
  if (custom.background) decl.push(`--pos-bg:${custom.background}`, `--cashier-bg:${custom.background}`);
  if (custom.surface) decl.push(`--pos-surface:${custom.surface}`, `--cashier-panel:${custom.surface}`);
  if (custom.border) decl.push(`--pos-border:${custom.border}`, `--cashier-line:${custom.border}`);
  if (custom.radius) decl.push(`--pos-radius:${custom.radius}px`);
  if (!decl.length) return "";
  const body = decl.map((d) => `${d} !important;`).join("");
  return `.garage-shell[data-cashier-theme]:not([data-cashier-theme="garage-default"]),[data-cashier-theme-scope]:not([data-cashier-theme-scope="garage-default"]){${body}}` +
    (custom.background ? `.garage-shell[data-cashier-theme]:not([data-cashier-theme="garage-default"]){background:${custom.background} !important;}` : "");
}

// ---- penyimpanan per perangkat + langganan (Theme Studio ↔ <style> global)
const listeners = new Set<() => void>();
let cache: PosThemeCustom | null = null;

export function readThemeCustom(): PosThemeCustom {
  if (cache) return cache;
  try {
    cache = sanitizeThemeCustom(JSON.parse(window.localStorage.getItem(POS_THEME_CUSTOM_KEY) ?? "null"));
  } catch {
    cache = {};
  }
  return cache;
}

const EMPTY: PosThemeCustom = {};
export function readThemeCustomServer(): PosThemeCustom {
  return EMPTY;
}

export function writeThemeCustom(next: PosThemeCustom) {
  cache = sanitizeThemeCustom(next);
  try {
    if (Object.keys(cache).length) window.localStorage.setItem(POS_THEME_CUSTOM_KEY, JSON.stringify(cache));
    else window.localStorage.removeItem(POS_THEME_CUSTOM_KEY);
  } catch {
    /* penyimpanan diblokir: berlaku sampai muat ulang */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeThemeCustom(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
