import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createOrder, getOrderData } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateOrderResult = Awaited<ReturnType<typeof createOrder>>;

const orderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  tableNumber: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, "Nomor meja harus 01 sampai 50.")
    .refine((value) => Number(value) >= 1 && Number(value) <= 50, {
      message: "Nomor meja harus 01 sampai 50.",
    })
    .optional(),
  tableLabel: z.string().min(1).optional(),
  paymentMethod: z.string().min(1).optional(),
  paymentProvider: z.string().min(1).optional(),
  paymentReference: z.string().trim().optional(),
  cashReceived: z.number().int().nonnegative().optional(),
  customerId: z.string().uuid().optional(),
  memberPhone: z.string().trim().min(8).optional(),
  guestName: z.string().trim().min(2).max(80).optional(),
  guestPhone: z.string().trim().min(8).max(24).optional(),
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
        method: z.string().trim().min(1).max(40),
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
        qty: z.number().int().positive(),
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
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
    const offlineSync = request.headers.get("x-garage-offline-sync") === "1";
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
