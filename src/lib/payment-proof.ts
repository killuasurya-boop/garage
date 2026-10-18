// Bukti transfer/QRIS dari menu digital. Pelanggan membuktikan kepemilikan
// order lewat token invoice (/invoice/{token}); file disimpan privat di
// storage/profiles/payment dan hanya bisa dibuka staf yang login.

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { ProfileFileError, saveProfileFile } from "@/lib/profile-file-storage";

const CLOSED_STATUSES = ["paid", "rejected", "voided", "cancelled", "refunded"];

export async function attachPaymentProof(token: string, file: unknown) {
  const safeToken = token.trim();
  if (safeToken.length < 12 || safeToken.length > 120) {
    throw new ProfileFileError(400, "INVALID_TOKEN", "Token pesanan tidak valid.");
  }
  const db = getDb();
  const [order] = await db
    .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status })
    .from(orders)
    .where(eq(orders.invoiceTrackingToken, safeToken))
    .limit(1);
  if (!order) throw new ProfileFileError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new ProfileFileError(409, "ORDER_CLOSED", "Pesanan ini sudah lunas atau dibatalkan — bukti tidak perlu diunggah.");
  }
  const fileName = await saveProfileFile("payment", order.id, file, { allowPdf: true });
  const url = `/api/orders/${order.id}/payment-proof/${fileName}`;
  const now = new Date();
  await db.update(orders).set({ paymentProofUrl: url, paymentProofAt: now, updatedAt: now }).where(eq(orders.id, order.id));
  return { orderId: order.id, orderNo: order.orderNo, uploadedAt: now.toISOString() };
}
