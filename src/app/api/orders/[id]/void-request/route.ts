import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ORDER_CANCEL_REASON_CODES } from "@/lib/approval-rules";
import { requestOrderVoidApproval } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type VoidRequestResult = Awaited<ReturnType<typeof requestOrderVoidApproval>>;

const voidRequestSchema = z.object({
  reasonCode: z.enum(ORDER_CANCEL_REASON_CODES),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "order-void-request", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireCashierSession();
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, voidRequestSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  // Kirim ulang setelah koneksi putus → kembalikan hasil pertama, bukan error
  // "sudah dibatalkan" yang membingungkan kasir.
  const key = readIdempotencyKey(request);
  const cache = key
    ? checkIdempotency<VoidRequestResult>(`order-void-request:${session.data.user.id}:${id}`, key, 15 * 60_000)
    : null;
  if (cache?.kind === "hit") return ok(cache.result);
  if (cache?.kind === "pending") {
    return fail(409, "ORDER_VOID_IN_PROGRESS", "Pengajuan batal order ini masih diproses.");
  }
  try {
    const result = await requestOrderVoidApproval(id, body.data, session.data);
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result);
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    return fail(
      400,
      "ORDER_VOID_REQUEST_FAILED",
      error instanceof Error ? error.message : "Gagal mengajukan pembatalan order.",
    );
  }
}
