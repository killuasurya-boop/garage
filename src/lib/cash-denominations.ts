// Pecahan Rupiah yang dihitung saat tutup shift (kertas + koin yang beredar).
export const IDR_CASH_DENOMINATIONS = [
  100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100,
] as const;

const validDenominationKeys = new Set<string>(IDR_CASH_DENOMINATIONS.map(String));

export function isValidDenominationKey(key: string) {
  return validDenominationKeys.has(key);
}

/** Total uang dari jumlah lembar/keping per pecahan; pecahan tak dikenal diabaikan. */
export function sumDenominations(denominations: Record<string, number>) {
  return Object.entries(denominations).reduce((sum, [key, count]) => {
    const qty = Number(count);
    if (!isValidDenominationKey(key) || !Number.isFinite(qty) || qty <= 0) return sum;
    return sum + Number(key) * Math.floor(qty);
  }, 0);
}
