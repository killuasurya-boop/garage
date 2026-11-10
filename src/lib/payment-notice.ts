// Label pembayaran untuk NOTIFIKASI staf (Smart Notification V2).
// Aturan: menampilkan/ memilih QRIS tidak pernah berarti lunas. Garage belum punya
// verifikasi QRIS otomatis, jadi non-tunai yang lunas selalu disebut "verifikasi
// manual kasir". Status tetap dari paymentStatusOf — fungsi ini hanya teks.

import type { PaymentStatus } from "@/lib/payment-status";

const NON_CASH = /qris|transfer|e-?wallet|ovo|gopay|dana|shopee|debit|kartu|card|edc/i;

export function isNonCashMethod(method: string | null | undefined) {
  return NON_CASH.test(method ?? "");
}

/** "QRIS · menunggu verifikasi kasir", "Tunai · belum dibayar", "QRIS · lunas (verifikasi manual kasir)". */
export function paymentNoticeLabel(method: string | null | undefined, status: PaymentStatus) {
  const name = (method ?? "").trim() || "Metode belum dipilih";
  if (status === "cancelled") return `${name} · dibatalkan`;
  if (status === "refund") return `${name} · refund`;
  if (status === "paid") return isNonCashMethod(method) ? `${name} · lunas (verifikasi manual kasir)` : `${name} · lunas`;
  return isNonCashMethod(method) ? `${name} · menunggu verifikasi kasir` : `${name} · belum dibayar`;
}
