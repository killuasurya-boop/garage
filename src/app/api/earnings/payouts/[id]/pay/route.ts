import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { markPayoutPaid } from "@/lib/garage-earnings";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  paymentRef: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("earnings:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const { id } = await context.params;
  const row = await markPayoutPaid({
    payoutId: id,
    paidByUserId: session.data.user.id,
    paymentRef: body.data.paymentRef,
    note: body.data.note,
  });
  if (!row) {
    return fail(409, "PAYOUT_NOT_APPROVED", "Payout belum di-approve.");
  }

  return ok({ payout: row });
}
