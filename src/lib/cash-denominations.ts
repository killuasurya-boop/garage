// Pecahan Rupiah yang dihitung saat buka & tutup shift (kertas + koin beredar).
// Kunci = nilai pecahan; koin Rp1.000 memakai kunci "1000k" agar terpisah dari
// uang kertas Rp1.000 (owner, Okt 2026 — laporan pecahan buka/tutup).
export const IDR_CASH_DENOMINATIONS = [
  100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100,
] as const;

export type CashDenomination = {
  key: string;
  value: number;
  kind: "note" | "coin";
  label: string;
};

const rupiahLabel = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

export const CASH_DENOMINATIONS: readonly CashDenomination[] = [
  ...[100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000].map((value) => ({
    key: String(value),
    value,
    kind: "note" as const,
    label: rupiahLabel(value),
  })),
  { key: "1000k", value: 1_000, kind: "coin", label: "Rp1.000 koin" },
  ...[500, 200, 100].map((value) => ({
    key: String(value),
    value,
    kind: "coin" as const,
    label: `${rupiahLabel(value)} koin`,
  })),
];

const denominationByKey = new Map(CASH_DENOMINATIONS.map((item) => [item.key, item]));

export function isValidDenominationKey(key: string) {
  return denominationByKey.has(key);
}

export function denominationValue(key: string) {
  return denominationByKey.get(key)?.value ?? 0;
}

export function denominationLabel(key: string) {
  return denominationByKey.get(key)?.label ?? key;
}

/** Total uang dari jumlah lembar/keping per pecahan; pecahan tak dikenal diabaikan. */
export function sumDenominations(denominations: Record<string, number>) {
  return Object.entries(denominations).reduce((sum, [key, count]) => {
    const qty = Number(count);
    if (!isValidDenominationKey(key) || !Number.isFinite(qty) || qty <= 0) return sum;
    return sum + denominationValue(key) * Math.floor(qty);
  }, 0);
}

/**
 * B4 (PRD §10.8): pecahan yang jumlahnya berbeda antara dua hitungan (kosong = 0).
 * Kosong = kedua hitungan sama persis per pecahan, bukan hanya totalnya.
 */
export function denominationMismatches(
  first: Record<string, number> | null | undefined,
  second: Record<string, number> | null | undefined,
) {
  const qty = (counts: Record<string, number> | null | undefined, key: string) =>
    Math.max(0, Math.floor(Number(counts?.[key]) || 0));
  return CASH_DENOMINATIONS.flatMap((item) => {
    const a = qty(first, item.key);
    const b = qty(second, item.key);
    return a === b ? [] : [{ key: item.key, label: item.label, first: a, second: b }];
  });
}

/** Baris pecahan berurutan (besar → kecil) untuk laporan; hanya yang terisi bila onlyFilled. */
export function denominationRows(denominations: Record<string, number> | null | undefined, onlyFilled = false) {
  const counts = denominations ?? {};
  return CASH_DENOMINATIONS.map((item) => {
    const qty = Math.max(0, Math.floor(Number(counts[item.key]) || 0));
    return { ...item, qty, total: qty * item.value };
  }).filter((row) => !onlyFilled || row.qty > 0);
}
