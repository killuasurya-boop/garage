/**
 * Pintasan keyboard kasir POS (Fase 2 "Kasir Lancar", 25 Nov 2026).
 * Satu daftar untuk listener keyboard DAN lembar pintasan (`?`), jadi tidak ada daftar ganda.
 * Tombol F yang sudah dihafal kasir tidak diubah; F8 dan `?` hanya tambahan.
 */

export type PosShortcut = {
  key: string;
  label: string;
  /** Tombol global (bekerja saat fokus tidak di kolom ketik dan tidak ada dialog terbuka). */
  global: boolean;
};

export const POS_SHORTCUTS: readonly PosShortcut[] = [
  { key: "F1", label: "Kasir — fokus ke kolom cari / scan", global: true },
  { key: "F2", label: "Pesanan QR masuk", global: true },
  { key: "F3", label: "Peta meja", global: true },
  { key: "F4", label: "Riwayat struk", global: true },
  { key: "F6", label: "Belum Bayar", global: true },
  { key: "F8", label: "Bayar nanti (keranjang terisi)", global: true },
  { key: "F9", label: "Bayar (keranjang terisi)", global: true },
  { key: "[", label: "Lipat / buka sidebar", global: true },
  { key: "?", label: "Lembar pintasan ini", global: true },
  { key: "Enter", label: "Di kolom cari: tambah menu teratas / hasil scan", global: false },
  { key: "3*cl", label: "Di kolom cari: tambah 3× menu teratas (kode singkat cl)", global: false },
  { key: "Esc", label: "Di kolom cari: kosongkan", global: false },
];

const GLOBAL_KEYS = new Set(POS_SHORTCUTS.filter((shortcut) => shortcut.global).map((shortcut) => shortcut.key));
/** Tombol yang juga dipakai saat mengetik — tidak boleh dicegat bila fokus di kolom ketik. */
const TYPING_KEYS = new Set(["[", "?"]);

/** Apakah event keyboard ini pintasan global POS? (Ctrl/Alt/Meta = bukan pintasan). */
export function isPosGlobalShortcut(
  event: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  targetIsTyping: boolean,
) {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (!GLOBAL_KEYS.has(event.key)) return false;
  if (TYPING_KEYS.has(event.key) && targetIsTyping) return false;
  return true;
}
