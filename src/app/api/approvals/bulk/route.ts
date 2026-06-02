import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { decideApprovalsBulk } from "@/lib/garage-service";
import { checkIdempotency, readIdempotencyKey } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type BulkDecisionResult = Awaited<ReturnType<typeof decideApprovalsBulk>>;

const bulkSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    status: z.enum(["approved", "rejected"]),
    reasonDecided: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) =>
      data.status !== "rejected" ||
      (data.reasonDecided && data.reasonDecided.length >= 5),
    {
      message: "Alasan reject wajib diisi minimal 5 karakter.",
      path: ["reasonDecided"],
    },
  );

export async function POST(request: Request) {
  const limited = rateLimit(request, "approvals-bulk", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requirePermission("approvals:decide");
  if (session.response) return session.response;

  const body = await readJson(request, bulkSchema);
  if (body.error) return body.error;

  const key = readIdempotencyKey(request);
  const cache = key
    ? checkIdempotency<BulkDecisionResult>(`approvals-bulk:${session.data.user.id}`, key)
    : null;

  if (cache?.kind === "hit") return ok(cache.result);
  if (cache?.kind === "pending") {
    return fail(409, "APPROVAL_DECISION_IN_PROGRESS", "Keputusan dengan key yang sama masih diproses.");
  }

  try {
    const result = await decideApprovalsBulk(
      body.data.ids,
      { status: body.data.status, reasonDecided: body.data.reasonDecided },
      session.data,
    );
    if (cache?.kind === "miss") cache.commit(result);
    return ok(result);
  } catch (error) {
    if (cache?.kind === "miss") cache.abandon();
    throw error;
  }
}
