// =============================================================================
// Minta Bahan Bar & Dapur — aturan murni (tanpa DB), diuji unit.
//   M1  saran jumlah: stok target − stok ruang, dibulatkan ke kemasan.
//   M2  perkiraan habis: laju pakai/jam (hari ini, atau rata-rata 7 hari) → jam habis.
//   M6  koreksi terima: selisih kiriman vs diterima → kekurangan (masuk PO).
// =============================================================================

export type MaterialStatus = "ok" | "low" | "out";

/** Asumsi jam jual per hari untuk rata-rata 7 hari (kafe buka ±12 jam). */
export const TRADING_HOURS_PER_DAY = 12;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Stok target ruang: par_stock bila diisi, selain itu 2× stok minimum. */
export function targetStock(minStock: number, parStock: number) {
  if (parStock > 0) return parStock;
  return minStock > 0 ? minStock * 2 : 0;
}

export function materialStatus(onHand: number, minStock: number): MaterialStatus {
  if (onHand <= 0) return "out";
  return minStock > 0 && onHand <= minStock ? "low" : "ok";
}

/**
 * Jumlah usulan Minta Bahan (0 = tidak perlu). Hanya untuk bahan menipis/habis.
 * `packFactors` = isi kemasan dalam satuan dasar (mis. 1000 g per bag); dipakai
 * kemasan terkecil > 1 agar gudang mengirim utuh. Kemasan yang lebih besar dari
 * 2× kebutuhan diabaikan (jangan kirim 1 karung untuk kurang 200 g).
 */
export function suggestRequestQty(input: {
  onHand: number;
  minStock: number;
  parStock: number;
  packFactors?: number[];
}): number {
  const status = materialStatus(input.onHand, input.minStock);
  if (status === "ok") return 0;
  const target = targetStock(input.minStock, input.parStock);
  const need = target - Math.max(0, input.onHand);
  if (!(need > 0)) return 0;
  const pack = (input.packFactors ?? []).filter((f) => f > 1).sort((a, b) => a - b)[0];
  if (pack && pack <= need * 2) return round4(Math.ceil(need / pack) * pack);
  return round4(Math.ceil(need * 100) / 100);
}

/**
 * Laju pakai per jam. Hari ini dipakai bila sudah ada pemakaian (pola jam ini
 * lebih akurat); selain itu rata-rata 7 hari ÷ jam jual.
 */
export function usagePerHour(input: { usedToday: number; hoursOpenToday: number; used7d: number }) {
  if (input.usedToday > 0 && input.hoursOpenToday > 0) return input.usedToday / Math.max(1, input.hoursOpenToday);
  if (input.used7d > 0) return input.used7d / (7 * TRADING_HOURS_PER_DAY);
  return 0;
}

/** Perkiraan jam habis (null bila tidak terpakai / sudah habis). */
export function estimateRunoutAt(onHand: number, perHour: number, now: Date): Date | null {
  if (!(perHour > 0) || onHand <= 0) return null;
  return new Date(now.getTime() + (onHand / perHour) * 3_600_000);
}

/** Sisa porsi dari stok & takaran resep per porsi (null bila tidak ada resep). */
export function portionsLeft(onHand: number, perPortion: number | null | undefined) {
  if (!perPortion || perPortion <= 0) return null;
  return Math.max(0, Math.floor(onHand / perPortion));
}

/** Koreksi saat terima: kurang dari kiriman → selisih jadi kekurangan baru. */
export function receiveShortfall(sentQty: number, receivedQty: number | null | undefined) {
  if (receivedQty == null) return 0;
  return round4(Math.max(0, sentQty - Math.max(0, receivedQty)));
}
