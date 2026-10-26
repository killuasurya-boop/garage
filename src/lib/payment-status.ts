// Status pembayaran ≠ metode pembayaran (owner, Okt 2026).
// Pending    : belum dikonfirmasi (belum bayar / QRIS-Transfer menunggu kasir cek).
// Lunas      : kasir sudah konfirmasi uang / notifikasi bank.
// Dibatalkan : transaksi resmi dibatalkan (void, ditolak, invoice dihapus).
// Refund     : dana dikembalikan (order direfund penuh / payment refunded).
// Metode: Cash, QRIS, Transfer, E-Wallet, dll.

export type PaymentStatus = "pending" | "paid" | "cancelled" | "refund";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Lunas",
  cancelled: "Dibatalkan",
  refund: "Refund",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "cancelled", "refund"];

const CANCELLED_ORDER_STATUSES = new Set(["voided", "rejected", "cancelled", "failed", "void"]);

/** Order status yang tercakup tiap status pembayaran (untuk filter daftar). */
export const ORDER_STATUSES_FOR_PAYMENT_STATUS: Record<PaymentStatus, string[]> = {
  pending: ["pending_cashier", "awaiting_payment", "accepted", "pending", "open"],
  paid: ["paid", "completed"],
  cancelled: [...CANCELLED_ORDER_STATUSES],
  refund: ["refunded"],
};

/** Status pembayaran dari status order (+ status baris payment terbaru bila ada). */
export function paymentStatusOf(order: { status?: string | null }, paymentStatus?: string | null): PaymentStatus {
  const status = (order.status ?? "").toLowerCase();
  if (status === "refunded" || paymentStatus === "refunded") return "refund";
  if (CANCELLED_ORDER_STATUSES.has(status) || paymentStatus === "failed") return "cancelled";
  if (status === "paid" || status === "completed") return "paid";
  return "pending";
}

/** Jumlah yang sudah dibayar & sisa tagihan. */
export function paymentBalance(total: number, status: PaymentStatus, paidAmount?: number | null) {
  const paid = Math.max(0, paidAmount ?? (status === "paid" ? total : 0));
  const closed = status === "cancelled" || status === "refund";
  return { paid, balanceDue: closed ? 0 : Math.max(0, total - paid) };
}

export type ChannelGroup = "pos_dine_in" | "digital_menu" | "takeaway" | "delivery" | "quick_retail";

export const CHANNEL_GROUP_LABEL: Record<ChannelGroup, string> = {
  pos_dine_in: "Dine-in kasir",
  digital_menu: "Menu digital (meja)",
  takeaway: "Take away",
  delivery: "Delivery",
  quick_retail: "Penjualan langsung",
};

export const CHANNEL_GROUPS: ChannelGroup[] = ["pos_dine_in", "digital_menu", "takeaway", "delivery", "quick_retail"];

/**
 * Jenis pesanan untuk laporan & filter: Dine-in kasir (POS), Menu digital meja
 * (QR meja / waiter), Take away (POS / QR), Delivery, Penjualan langsung
 * (Quick Retail POS-05, kanal "Penjualan Langsung").
 */
export function channelGroupOf(order: {
  orderSource?: string | null;
  fulfillment?: string | null;
  channel?: string | null;
}): ChannelGroup {
  const fulfillment = (order.fulfillment ?? "").toLowerCase();
  const channel = (order.channel ?? "").toLowerCase();
  const source = (order.orderSource ?? "pos").toLowerCase();
  if (channel === "penjualan langsung") return "quick_retail";
  if (fulfillment === "delivery" || channel.includes("delivery")) return "delivery";
  if (fulfillment === "takeaway" || /take ?away|takeaway/.test(channel)) return "takeaway";
  if (source === "qr_table" || fulfillment === "dine-in" || channel.includes("qr")) return "digital_menu";
  return "pos_dine_in";
}
