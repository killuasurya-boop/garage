import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { voidOrder } from "@/lib/garage-service";
import { checkIdempotency } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type VoidResult = Awaited<ReturnType<typeof voidOrder>>;

const voidSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "order-void", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  // Void/refund cuma boleh oleh role dengan finance:write (Manager / Finance / Owner)
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, voidSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  // Idempotency anchor = order id: void operasi irreversible, klik dobel tidak boleh
  // dieksekusi 2x. Pakai id sebagai key supaya cukup tanpa header dari klien.
  const cache = checkIdempotency<VoidResult>(`order-void:${session.data.user.id}`, id);
  if (cache.kind === "hit") return ok(cache.result);
  if (cache.kind === "pending") {
    return fail(409, "ORDER_VOID_IN_PROGRESS", "Void order ini masih diproses.");
  }

  try {
    const result = await voidOrder(id, body.data.reason, session.data);
    cache.commit(result);
    return ok(result);
  } catch (error) {
    cache.abandon();
    return fail(
      400,
      "ORDER_VOID_FAILED",
      error instanceof Error ? error.message : "Gagal void order.",
    );
  }
}
