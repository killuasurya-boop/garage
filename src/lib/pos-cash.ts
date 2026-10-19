// Nominal cepat uang tunai di POS (owner, Okt 2026): pecahan 5.000 & 10.000 ikut
// ditawarkan, plus pembulatan ke atas total supaya kasir tinggal tap.
const DENOMINATIONS = [5_000, 10_000, 20_000, 50_000, 100_000];
const ROUND_STEPS = [5_000, 10_000, 50_000, 100_000];

/** Pilihan nominal uang diterima (≥ total, unik, urut), maksimal `limit`. */
export function quickCashOptions(totalDue: number, limit = 5): number[] {
  if (!Number.isFinite(totalDue) || totalDue <= 0) return DENOMINATIONS.slice(0, limit);
  const rounded = ROUND_STEPS.map((step) => Math.ceil(totalDue / step) * step);
  return [...new Set([...DENOMINATIONS, ...rounded])]
    .filter((amount) => amount >= totalDue)
    .sort((a, b) => a - b)
    .slice(0, limit);
}
