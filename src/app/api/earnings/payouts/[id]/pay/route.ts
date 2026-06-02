import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { markPayoutPaid } from "@/lib/garage-earnings";
import { checkIdempotency } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type PayoutRow = Awaited<ReturnType<typeof markPayoutPaid>>;

const schema = z.object({
  paymentRef: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "payout-pay", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("earnings:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const { id } = await context.params;
  // Idempotency anchor = payout id: bayar 2x = uang keluar ganda. Cegah keras.
  const cache = checkIdempotency<{ payout: PayoutRow }>(`payout-pay:${id}`, id);
  if (cache.kind === "hit") return ok(cache.result);
  if (cache.kind === "pending") {
    return fail(409, "PAYOUT_PAY_IN_PROGRESS", "Pembayaran payout ini masih diproses.");
  }

  try {
    const row = await markPayoutPaid({
      payoutId: id,
      paidByUserId: session.data.user.id,
      paymentRef: body.data.paymentRef,
      note: body.data.note,
    });
    if (!row) {
      cache.abandon();
      return fail(409, "PAYOUT_NOT_APPROVED", "Payout belum di-approve.");
    }
    const result = { payout: row };
    cache.commit(result);
    return ok(result);
  } catch (error) {
    cache.abandon();
    throw error;
  }
}
