import { IDR_CASH_DENOMINATIONS } from "@/lib/cash-denominations";

/** Pecahan (besar → kecil) yang totalnya tepat `amount` — untuk tutup shift di tes (P3: pecahan wajib). */
export function cashCount(amount: number): Record<string, number> {
  let rest = Math.max(0, Math.floor(amount));
  const counts: Record<string, number> = {};
  for (const value of IDR_CASH_DENOMINATIONS) {
    const qty = Math.floor(rest / value);
    if (qty > 0) {
      counts[String(value)] = qty;
      rest -= qty * value;
    }
  }
  if (!Object.keys(counts).length) counts["100000"] = 0; // laci kosong
  return counts;
}
