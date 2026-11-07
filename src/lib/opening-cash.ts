// Modal awal laci saat buka shift (owner, 6 Nov 2026): nominal bebas sesuai uang yang benar-benar ada di laci
// (contoh Rp55.200, Rp456.000) — dulu dipaksa kelipatan Rp50.000. Satu-satunya syarat: kelipatan Rp100 (koin
// terkecil) dan tidak melewati batas atas Pengaturan (mencegah salah ketik). Hitungan per pecahan tetap wajib sama.
// Aman diimport dari client.

export const OPENING_CASH_STEP = 100;
export const OPENING_CASH_DEFAULT_MAX = 2_000_000;
/** Batas keras server (sanity) — setting tidak bisa melebihi ini. */
export const OPENING_CASH_HARD_MAX = 50_000_000;

/** Pesan kesalahan untuk modal awal, atau null bila sah. */
export function openingCashError(amount: number, max: number = OPENING_CASH_DEFAULT_MAX): string | null {
  const limit = Math.min(Math.max(OPENING_CASH_STEP, Math.round(max)), OPENING_CASH_HARD_MAX);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return "Modal awal harus angka rupiah bulat.";
  if (amount <= 0) return "Modal awal harus lebih dari Rp0.";
  if (amount % OPENING_CASH_STEP !== 0) return "Modal awal harus kelipatan Rp100 (koin terkecil).";
  if (amount > limit) {
    return `Modal awal maksimal Rp${limit.toLocaleString("id-ID")} (Pengaturan → Shift). Periksa lagi, mungkin salah ketik.`;
  }
  return null;
}
