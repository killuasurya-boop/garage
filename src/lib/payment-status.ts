// Status pembayaran ≠ metode pembayaran (owner, Okt 2026).
// Status: Pending (belum lunas / QRIS-Transfer menunggu verifikasi kasir),
// Lunas (kasir sudah konfirmasi uang/notifikasi bank), Gagal (dibatalkan,
// ditolak, atau dihapus). Metode: Cash, QRIS, Transfer, E-Wallet, dll.

export type PaymentStatus = "pending" | "paid" | "failed";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Lunas",
  failed: "Gagal",
};

const FAILED_ORDER_STATUSES = new Set(["voided", "rejected", "cancelled", "refunded", "failed"]);

/** Status pembayaran dari status order (+ status baris payment bila ada). */
export function paymentStatusOf(order: { status?: string | null }, paymentStatus?: string | null): PaymentStatus {
  const status = (order.status ?? "").toLowerCase();
  if (FAILED_ORDER_STATUSES.has(status) || paymentStatus === "failed") return "failed";
  if (status === "paid" || status === "completed") return "paid";
  return "pending";
}

/** Jumlah yang sudah dibayar & sisa tagihan. */
export function paymentBalance(total: number, status: PaymentStatus, paidAmount?: number | null) {
  const paid = Math.max(0, paidAmount ?? (status === "paid" ? total : 0));
  return { paid, balanceDue: status === "failed" ? 0 : Math.max(0, total - paid) };
}
