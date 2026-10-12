import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ORDER_CANCEL_REASON_CODES } from "@/lib/approval-rules";
import { getRefundableOrder, requestOrderRefundApproval } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type RefundRequestResult = Awaited<ReturnType<typeof requestOrderRefundApproval>>;

const refundRequestSchema = z.object({
  reasonCode: z.enum(ORDER_CANCEL_REASON_CODES),
  note: z.string().trim().max(200).optional().nullable(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        qty: z.number().int().positive().max(999),
      }),
    )
    .min(1, "Pilih minimal satu item untuk direfund.")
    .max(50),
});

/** Daftar item order yang masih bisa direfund. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCashierSession();
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const order = await getRefundableOrder(id, session.data);
  if (!order) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }
  return ok(order);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "order-refund-request", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireCashierSession();
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, refundRequestSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  // Manajer/Owner langsung dieksekusi → retry setelah koneksi putus tidak boleh
  // me-refund item yang sama dua kali.
  const key = readIdempotencyKey(request);
  const cache = key
    ? checkIdempotency<RefundRequestResult>(`order-refund:${session.data.user.id}:${id}`, key, 15 * 60_000)
    : null;
  if (cache?.kind === "hit") return ok(cache.result, { status: 200 });
  if (cache?.kind === "pending") {
    return fail(409, "ORDER_REFUND_IN_PROGRESS", "Pengajuan refund ini masih diproses.");
  }
  try {
    const result = await requestOrderRefundApproval(id, body.data, session.data);
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result, { status: 201 });
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "ORDER_REFUND_REQUEST_FAILED",
      error instanceof Error ? error.message : "Gagal mengajukan refund.",
    );
  }
}
