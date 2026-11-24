/**
 * Metode bayar penjualan POS yang sah (audit POS Nov 2026).
 *
 * API order dulu menerima teks apa saja lalu laporan menggolongkannya dengan
 * mencocokkan potongan kata; "Gopay"/"Kartu" bisa masuk kelompok yang salah.
 * Sekarang setiap metode wajib masuk salah satu kelompok di bawah. Ejaan lama
 * yang sudah dipakai ("Transfer", "Bank Transfer", "E-wallet", "Tunai") tetap
 * diterima karena kelompoknya jelas.
 */
export const POS_PAYMENT_METHOD_GROUPS = ["cash", "qris", "transfer", "ewallet"] as const;
export type PosPaymentMethodGroup = (typeof POS_PAYMENT_METHOD_GROUPS)[number];

export const POS_PAYMENT_METHOD_MESSAGE =
  "Metode bayar tidak dikenal. Pilih Tunai (Cash), QRIS, Transfer, atau E-Wallet.";

/** Batas qty per baris (sama dengan Penjualan Langsung) dan jumlah baris per order. */
export const POS_MAX_LINE_QTY = 99;
export const POS_MAX_ORDER_LINES = 100;

export function posPaymentMethodGroup(method: string | null | undefined): PosPaymentMethodGroup | null {
  const value = (method ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "cash" || value === "tunai") return "cash";
  if (value === "qris") return "qris";
  if (value === "transfer" || value === "bank transfer" || value === "transfer bank") return "transfer";
  if (value === "e-wallet" || value === "ewallet" || value === "e wallet") return "ewallet";
  return null;
}

export function isPosPaymentMethod(method: string | null | undefined): boolean {
  return posPaymentMethodGroup(method) !== null;
}
