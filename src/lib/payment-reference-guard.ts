import { and, eq, ne, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { orders, payments } from "@/db/schema";
import { paymentReferenceKey, TenderGuardError } from "@/lib/tender-guard";

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Order yang dibatalkan tidak mengunci referensinya: kasir yang membatalkan
// order salah lalu mengulang dengan pembayaran QRIS yang sama tetap bisa.
const RELEASED_ORDER_STATUSES = ["voided", "rejected", "cancelled", "failed", "void"];
const RELEASED_PAYMENT_STATUSES = ["failed", "refunded", "voided", "cancelled"];

export class PaymentReferenceUsedError extends TenderGuardError {
  constructor(
    readonly reference: string,
    readonly orderNo: string,
  ) {
    super(
      "REFERENCE_DUPLICATE_IN_ORDER",
      `Referensi ${reference} sudah dipakai untuk pembayaran ${orderNo}. Cek notifikasi merchant — satu pembayaran QRIS/transfer hanya untuk satu order.`,
    );
    this.name = "PaymentReferenceUsedError";
  }
}

/**
 * Tolak referensi QRIS/transfer yang sudah dipakai order lain (PRD §09.2
 * "QRIS bayar ganda"). Dipanggil di dalam transaksi; advisory lock per
 * referensi menyerialkan dua kasir yang mengetik referensi sama bersamaan.
 */
export async function assertPaymentReferencesUnused(
  tx: DbTx,
  references: string[],
  options: { excludeOrderId?: string } = {},
) {
  const keys = [...new Set(references.map((ref) => paymentReferenceKey(ref)).filter((key): key is string => Boolean(key)))].sort();
  if (!keys.length) return;
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pay-ref:${key}`}))`);
  }
  const refKey = sql<string>`regexp_replace(upper(coalesce(${payments.metadata}->>'reference', '')), '[^A-Z0-9]', '', 'g')`;
  const conditions = [
    sql`${refKey} in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`,
    notInArray(payments.status, RELEASED_PAYMENT_STATUSES),
    notInArray(orders.status, RELEASED_ORDER_STATUSES),
  ];
  if (options.excludeOrderId) conditions.push(ne(payments.orderId, options.excludeOrderId));
  const [hit] = await tx
    .select({ orderNo: orders.orderNo, reference: sql<string>`${payments.metadata}->>'reference'` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(...conditions))
    .limit(1);
  if (hit) throw new PaymentReferenceUsedError(hit.reference, hit.orderNo);
}

// Ekspor untuk tes: status yang melepas referensi.
export const PAYMENT_REFERENCE_RELEASED = {
  orderStatuses: RELEASED_ORDER_STATUSES,
  paymentStatuses: RELEASED_PAYMENT_STATUSES,
};
