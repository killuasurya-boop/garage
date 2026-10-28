// =============================================================================
// U1 — Token semantik Garage OS (PRD §24.2, keputusan Owner D-02: GELAP SEMUA).
// Nama baku per PERAN (latar, permukaan, teks, status), di atas palet --garage-*.
// Setiap token teks dijaga tes kontras WCAG 2.2 AA (≥ 4.5:1) terhadap SEMUA latar;
// token batas kontrol & fokus ≥ 3:1 (design-tokens.test.ts). CSS: --gos-* di globals.css.
// Aman untuk klien (tanpa import server).
// =============================================================================

export type TokenGroup = "background" | "text" | "status" | "control" | "brand";

export type DesignToken = {
  /** Nama baku (dokumen, registri). */
  name: string;
  /** Variabel CSS yang dipakai komponen. */
  cssVar: `--gos-${string}`;
  hex: `#${string}`;
  group: TokenGroup;
  use: string;
};

export const DESIGN_TOKENS = [
  // Latar (dari terluar ke paling terangkat)
  { name: "bg.app", cssVar: "--gos-bg-app", hex: "#0a0a0c", group: "background", use: "Kanvas aplikasi" },
  { name: "bg.chrome", cssVar: "--gos-bg-chrome", hex: "#121216", group: "background", use: "Sidebar, topbar, popover" },
  { name: "bg.surface", cssVar: "--gos-bg-surface", hex: "#19191e", group: "background", use: "Kartu, panel, dialog, tabel" },
  { name: "bg.raised", cssVar: "--gos-bg-raised", hex: "#232329", group: "background", use: "Permukaan bertingkat, input, baris aktif" },
  // Teks
  { name: "text.primary", cssVar: "--gos-text-primary", hex: "#f4f4f5", group: "text", use: "Teks utama, angka uang, nama item" },
  { name: "text.secondary", cssVar: "--gos-text-secondary", hex: "#d0d0d6", group: "text", use: "Label, metadata penting" },
  { name: "text.muted", cssVar: "--gos-text-muted", hex: "#9a9aa4", group: "text", use: "Helper, keterangan — batas terendah untuk teks" },
  // Status (teks/ikon di latar gelap; selalu bersama label, tidak hanya warna)
  { name: "status.success", cssVar: "--gos-status-success", hex: "#a8f0c4", group: "status", use: "Sesuai / terverifikasi / berhasil" },
  { name: "status.warning", cssVar: "--gos-status-warning", hex: "#ffd8a8", group: "status", use: "Perlu perhatian / menunggu" },
  { name: "status.danger", cssVar: "--gos-status-danger", hex: "#ff5a66", group: "status", use: "Kurang / kritis / ditolak (teks merah yang lolos kontras)" },
  { name: "status.info", cssVar: "--gos-status-info", hex: "#93c5fd", group: "status", use: "Informasi, tautan kontekstual" },
  { name: "status.neutral", cssVar: "--gos-status-neutral", hex: "#d0d0d6", group: "status", use: "Draft / belum dimulai / arsip" },
  // Kontrol
  { name: "control.border", cssVar: "--gos-control-border", hex: "#71717f", group: "control", use: "Tepi input/kontrol yang harus terlihat (≥3:1)" },
  { name: "control.focus", cssVar: "--gos-control-focus", hex: "#f5a742", group: "control", use: "Focus ring (amber)" },
  // Brand
  { name: "brand.primary", cssVar: "--gos-brand-primary", hex: "#d11a2a", group: "brand", use: "Latar tombol CTA utama (teks putih) — JANGAN untuk teks" },
  { name: "brand.on-primary", cssVar: "--gos-brand-on-primary", hex: "#ffffff", group: "brand", use: "Teks di atas brand.primary" },
] as const satisfies readonly DesignToken[];

export type DesignTokenName = (typeof DESIGN_TOKENS)[number]["name"];

export function token(name: DesignTokenName) {
  return DESIGN_TOKENS.find((t) => t.name === name)!;
}

/** Variabel CSS untuk dipakai di className Tailwind: `text-[var(--gos-text-muted)]`. */
export const cssVar = (name: DesignTokenName) => `var(${token(name).cssVar})`;

// ── WCAG 2.2 ────────────────────────────────────────────────────────────────

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(clean.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG (1–21). */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA = { text: 4.5, largeText: 3, nonText: 3 } as const;

// ── Status baku (PRD §24.8/§24.9: ikon + teks, tidak bergantung warna) ──────

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_TONE_TOKEN: Record<StatusTone, DesignTokenName> = {
  success: "status.success",
  warning: "status.warning",
  danger: "status.danger",
  info: "status.info",
  neutral: "status.neutral",
};

/** Keadaan wajib setiap layar kritis (PRD §24.8). */
export const SCREEN_STATES = ["default", "empty", "loading", "error", "offline", "success", "unauthorized", "conflict", "stale"] as const;
export type ScreenState = (typeof SCREEN_STATES)[number];

/** Terminologi baku (PRD §24.9) — dicek tes agar komponen tidak memakai kata terlarang. */
export const FORBIDDEN_TERMS: Array<{ avoid: RegExp; use: string }> = [
  { avoid: /balance berhasil/i, use: "Sesuai / Selisih / Belum terverifikasi" },
  { avoid: /qris selesai/i, use: "Menunggu verifikasi pembayaran" },
  { avoid: /hapus transaksi/i, use: "Batalkan / Koreksi dengan jejak transaksi" },
  { avoid: /dicuri|pencuri/i, use: "Selisih memerlukan pemeriksaan" },
];
