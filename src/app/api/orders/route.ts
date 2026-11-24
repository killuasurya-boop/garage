import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createOrder, getOrderData } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import {
  POS_MAX_LINE_QTY,
  POS_MAX_ORDER_LINES,
  POS_PAYMENT_METHOD_MESSAGE,
  isPosPaymentMethod,
} from "@/lib/pos-payment-method";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateOrderResult = Awaited<ReturnType<typeof createOrder>>;

const orderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  // Penjualan langsung (Quick Retail, POS-05): orderType "takeaway" tanpa meja.
  saleChannel: z.literal("quick_retail").optional(),
  tableNumber: z
    .string()
    .trim()
    .refine((value) => parseTableNumber(value) !== null, { message: TABLE_NUMBER_RANGE_MESSAGE })
    .optional(),
  tableLabel: z.string().min(1).optional(),
  paymentMethod: z
    .string()
    .trim()
    .min(1)
    .refine(isPosPaymentMethod, { message: POS_PAYMENT_METHOD_MESSAGE })
    .optional(),
  paymentProvider: z.string().min(1).optional(),
  paymentReference: z.string().trim().max(80).optional(),
  cashReceived: z.number().int().nonnegative().optional(),
  customerId: z.string().uuid().optional(),
  memberPhone: z.string().trim().min(8).optional(),
  guestName: z.string().trim().min(2).max(80).optional(),
  guestPhone: z.string().trim().min(8).max(24).optional(),
  pointsToRedeem: z.number().int().min(0).max(1_000_000).optional(),
  memberRedeemToken: z.string().trim().max(600).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  manualDiscount: z
    .object({
      approvalId: z.string().trim().min(8).optional(),
      type: z.enum(["amount", "percent"]),
      rawValue: z.number().positive(),
      amount: z.number().int().nonnegative(),
      reason: z.string().trim().min(3).max(200),
    })
    .optional(),
  // Split payment opsional. Validasi sum = total + ≥ 2 split dilakukan di service
  // (karena route belum tahu total order). Backward compat: tanpa field → jalur lama.
  splits: z
    .array(
      z.object({
        method: z.string().trim().min(1).max(40).refine(isPosPaymentMethod, { message: POS_PAYMENT_METHOD_MESSAGE }),
        amount: z.number().int().positive(),
        provider: z.string().trim().max(60).optional(),
        reference: z.string().trim().max(80).optional(),
      }),
    )
    .min(2, "Split payment butuh minimal 2 metode")
    .max(6, "Maksimal 6 split per order")
    .optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        variantId: z.string().min(1),
        qty: z.number().int().positive().max(POS_MAX_LINE_QTY, `Qty per item maksimal ${POS_MAX_LINE_QTY}.`),
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(POS_MAX_ORDER_LINES, `Maksimal ${POS_MAX_ORDER_LINES} baris item per order.`),
});

export async function GET(request: Request) {
  // Daftar order berisi nominal & metode bayar → hanya kasir/Owner/Manajer.
  const session = await requireCashierSession();
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getOrderData({
      status: url.searchParams.get("status") ?? undefined,
      channel: url.searchParams.get("channel") ?? undefined,
    }),
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "orders-create", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, orderSchema);
  if (body.error) {
    return body.error;
  }

  const idempotencyKey = readIdempotencyKey(request);
  // Jendela 15 menit: kasir sering baru mengulang Bayar setelah WiFi/server pulih.
  // Retry dengan key sama dalam jendela ini mengembalikan order yang sama (tidak dobel).
  const cache = idempotencyKey
    ? checkIdempotency<CreateOrderResult>(
        `orders-create:${session.data.user.id}`,
        idempotencyKey,
        15 * 60_000,
      )
    : null;

  if (cache?.kind === "hit") {
    return ok(cache.result, { status: 200 });
  }
  if (cache?.kind === "pending") {
    return fail(409, "ORDER_IN_PROGRESS", "Order dengan key yang sama masih diproses.");
  }

  try {
    // Sinkron order offline: uang sudah diterima fisik → kekurangan tunai dicatat, tidak ditolak.
    // Hanya order yang benar-benar tertahan di antrean offline (dibuat ≥ 1 menit
    // lalu, maks 3 hari) yang dilonggarkan — header saja tidak cukup, supaya
    // kasir tidak bisa melewati cek "uang kurang" dengan header buatan.
    const offlineCreatedAt = Number(request.headers.get("x-garage-offline-created-at"));
    const offlineAgeMs = Number.isFinite(offlineCreatedAt) ? Date.now() - offlineCreatedAt : -1;
    const offlineSync =
      request.headers.get("x-garage-offline-sync") === "1" &&
      offlineAgeMs >= 60_000 &&
      offlineAgeMs <= 3 * 24 * 60 * 60_000;
    // Cache memori di atas hanya bertahan selama proses hidup; kunci juga
    // disimpan di order (unik di DB) sehingga retry setelah server restart
    // tetap mengembalikan order yang sama.
    const result = await createOrder(body.data, session.data, {
      offlineSync,
      requestKey: idempotencyKey ? `${session.data.user.id}:${idempotencyKey}` : undefined,
    });
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: "replayed" in result ? 200 : 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "ORDER_CREATE_FAILED",
      error instanceof Error ? error.message : "Gagal membuat order.",
    );
  }
}
