import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { approvePayout } from "@/lib/garage-earnings";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "payout-approve", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("earnings:manage");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const { id } = await context.params;
  const row = await approvePayout(id, session.data.user.id, body.data.note);
  if (!row) {
    return fail(409, "PAYOUT_NOT_PENDING", "Payout tidak dalam status pending.");
  }

  return ok({ payout: row });
}
