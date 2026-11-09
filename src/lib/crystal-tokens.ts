// =============================================================================
// Garage Crystal V5 — token visual permukaan publik (order, pilih meja, menu, member) dan sidebar internal.
// Konsep: Black Crystal Glass × Red Laser (papan Owner Nov 2026, docs/design-references/crystal-v5/).
// CSS: --gc-* di src/components/crystal/crystal.css. Teks dijaga tes kontras AA (crystal-tokens.test.ts).
// Aman untuk klien.
// =============================================================================

export type CrystalTokenGroup = "background" | "text" | "accent" | "status";

export type CrystalToken = {
  name: string;
  cssVar: `--gc-${string}`;
  hex: `#${string}`;
  group: CrystalTokenGroup;
  use: string;
};

export const CRYSTAL_TOKENS = [
  { name: "bg.obsidian", cssVar: "--gc-bg", hex: "#08090b", group: "background", use: "Kanvas utama" },
  { name: "bg.carbon", cssVar: "--gc-bg-2", hex: "#111216", group: "background", use: "Panel / header" },
  { name: "bg.graphite", cssVar: "--gc-surface", hex: "#1b1d21", group: "background", use: "Kartu crystal" },
  { name: "bg.crystal", cssVar: "--gc-surface-2", hex: "#24272d", group: "background", use: "Kartu terangkat, input" },
  { name: "text.primary", cssVar: "--gc-text", hex: "#ffffff", group: "text", use: "Judul, harga, nama produk" },
  { name: "text.cream", cssVar: "--gc-cream", hex: "#f3e8da", group: "text", use: "Teks hangat, headline sekunder" },
  { name: "text.secondary", cssVar: "--gc-text-2", hex: "#b8b8be", group: "text", use: "Deskripsi, metadata" },
  { name: "accent.red", cssVar: "--gc-red", hex: "#e1252b", group: "accent", use: "Latar tombol utama (teks putih) — bukan teks kecil" },
  { name: "accent.laser", cssVar: "--gc-laser", hex: "#ff2638", group: "accent", use: "Garis laser, border aktif, glow" },
  { name: "accent.laser-bright", cssVar: "--gc-laser-bright", hex: "#ff5362", group: "accent", use: "Teks merah di latar gelap (lolos AA)" },
  { name: "status.available", cssVar: "--gc-emerald", hex: "#23c96b", group: "status", use: "Tersedia / berhasil" },
  { name: "status.reserved", cssVar: "--gc-blue", hex: "#3984ff", group: "status", use: "Reservasi (ikon/titik; teks pakai --gc-blue-text)" },
  { name: "status.reserved-text", cssVar: "--gc-blue-text", hex: "#7fb0ff", group: "status", use: "Teks label reservasi" },
  { name: "status.warning", cssVar: "--gc-amber", hex: "#ffbd42", group: "status", use: "Perhatian / sedang dipilih" },
] as const satisfies readonly CrystalToken[];

export type CrystalTokenName = (typeof CRYSTAL_TOKENS)[number]["name"];

export function crystalToken(name: CrystalTokenName) {
  return CRYSTAL_TOKENS.find((t) => t.name === name)!;
}

/** Durasi & easing gerak bersama (ms). Semua dimatikan/diganti fade saat prefers-reduced-motion. */
export const CRYSTAL_MOTION = {
  press: 90,
  hover: 160,
  reveal: 420,
  sheet: 320,
  floorSwitch: 280,
  laserLoop: 5200,
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

/** Tingkat kartu member → nama skin CSS (`gc-tier-*`). Ultra tetap ada karena tier itu nyata di data. */
export function crystalTierSkin(tier: string | null | undefined) {
  const key = String(tier ?? "").toLowerCase();
  if (key.includes("ultra")) return "ultra";
  if (key.includes("platinum")) return "platinum";
  if (key.includes("gold")) return "gold";
  return "silver";
}
