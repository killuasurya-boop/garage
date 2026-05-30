import { z } from "zod";

import { requireMemberAuth } from "@/lib/member-auth";
import { redeemMemberPoints } from "@/lib/member-service";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";

export const runtime = "nodejs";

const redeemSchema = z.object({
  memberId: z.string().optional(),
  pointsToRedeem: z.number().int().min(100, "Minimal redeem 100 points."),
});

export async function POST(request: Request) {
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

  const result = await redeemMemberPoints({
    customerId: session.data.customer.id,
    pointsToRedeem: body.data.pointsToRedeem,
  });

  if (!result.data) {
    return errorJson(400, result.error ?? "Redeem points gagal.");
  }

  return successJson(result.data);
}
