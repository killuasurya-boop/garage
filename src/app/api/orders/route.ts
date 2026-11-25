import { z } from "zod";

import { fail, ok, readJson, serviceErrorResponse } from "@/lib/api-response";
import { createOrder, getOrderData, posOrderFingerprint } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { PAYMENT_METHOD_PATTERN } from "@/lib/payment-method-input";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateOrderResult = Awaited<ReturnType<typeof createOrder>>;

const paymentMethodField = z
  .string()
  .trim()
  .max(40)
  .regex(PAYMENT_METHOD_PATTERN, "Metode bayar tidak dikenal.");

const orderSchema = z.object({
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  // Penjualan langsung (Quick Retail, POS-05): orderType "takeaway" tanpa meja.
  saleChannel: z.literal("quick_retail").optional(),
  tableNumber: z
    .string()
    .trim()
    .refine((value) => parseTableNumber(value) !== null, { message: TABLE_NUMBER_RANGE_MESSAGE })
    .optional(),
  tableLabel: z.string().trim().min(1).max(40).optional(),
  paymentMethod: paymentMethodField.optional(),
  paymentProvider: z.string().trim().min(1).max(60).optional(),
  paymentReference: z.string().trim().max(80).optional(),
  cashReceived: z.number().int().nonnegative().optional(),
  customerId: z.string().uuid().optional(),
  memberPhone: z.string().trim().min(8).max(24).optional(),
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
        method: paymentMethodField,
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
        itemId: z.string().min(1).max(120),
        variantId: z.string().min(1).max(120),
        // Batas wajar per baris (S9): qty raksasa dulu bisa meluap kolom int line_total.
        qty: z.number().int().positive().max(999, "Qty per item maksimal 999."),
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(100, "Maksimal 100 baris item per order."),
  // Penjualan saat POS offline (Fase 4): nomor sementara OFF-…, waktu jual di perangkat, shift tempat uang masuk laci.
  offline: z
    .object({
      offlineNo: z.string().trim().regex(/^OFF-[A-Z0-9-]{3,40}$/, "Nomor offline tidak valid."),
      soldAt: z
        .string()
        .datetime({ offset: true })
        .refine((value) => {
          const age = Date.now() - new Date(value).getTime();
          return age >= -5 * 60_000 && age <= 3 * 24 * 60 * 60_000;
        }, "Waktu penjualan offline di luar batas (maks 3 hari)."),
      cashSessionId: z.string().uuid().nullable().optional(),
    })
    .optional(),
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
  // Sidik isi ikut di scope cache: kunci sama + isi berbeda tidak boleh mengembalikan
  // hasil lama dari memori — diteruskan ke service yang menolaknya (IDEMPOTENCY_MISMATCH).
  const cache = idempotencyKey
    ? checkIdempotency<CreateOrderResult>(
        `orders-create:${session.data.user.id}:${posOrderFingerprint(body.data)}`,
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
    return serviceErrorResponse(error, "ORDER_CREATE_FAILED", "Gagal membuat order. Coba lagi atau hubungi Owner.");
  }
}
