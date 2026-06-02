import { z } from "zod";

import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { requireMemberAuth } from "@/lib/member-auth";
import { redeemMemberPoints } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RedeemData = NonNullable<Awaited<ReturnType<typeof redeemMemberPoints>>["data"]>;

const redeemSchema = z.object({
  memberId: z.string().optional(),
  pointsToRedeem: z.number().int().min(100, "Minimal redeem 100 points."),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "points-redeem", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const body = await readMemberJson(request, redeemSchema);
  if (body.response) return body.response;

  if (
    body.data.memberId &&
    body.data.memberId !== session.data.customer.id &&
    body.data.memberId !== session.data.account.id
  ) {
    return errorJson(403, "Member tidak boleh redeem akun lain.");
  }

  // Anti double-tap redeem dari klien member (header opsional dari aplikasi member).
  const key = readIdempotencyKey(request);
  const cache = key
    ? checkIdempotency<RedeemData>(`points-redeem:${session.data.customer.id}`, key)
    : null;
  if (cache?.kind === "hit") return successJson(cache.result);
  if (cache?.kind === "pending") {
    return errorJson(409, "Redeem points masih diproses.");
  }

  const result = await redeemMemberPoints({
    customerId: session.data.customer.id,
    pointsToRedeem: body.data.pointsToRedeem,
  });

  if (!result.data) {
    if (cache?.kind === "miss") cache.abandon();
    return errorJson(400, result.error ?? "Redeem points gagal.");
  }

  if (cache?.kind === "miss") cache.commit(result.data);
  return successJson(result.data);
}
