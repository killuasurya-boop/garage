import { fail, ok } from "@/lib/api-response";
import { applyStockOpname } from "@/lib/garage-service";
import { checkIdempotency } from "@/lib/idempotency";
import { rateLimit } from "@/lib/rate-limit";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type OpnameResult = Awaited<ReturnType<typeof applyStockOpname>>;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "opname-apply", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const session = await requireAnyPermission(["inventory:write", "approvals:decide"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  // Idempotency anchor = opname id: apply 2x = stock movement ganda.
  const cache = checkIdempotency<OpnameResult>(`opname-apply:${id}`, id);
  if (cache.kind === "hit") return ok(cache.result);
  if (cache.kind === "pending") {
    return fail(409, "OPNAME_APPLY_IN_PROGRESS", "Apply opname ini masih diproses.");
  }

  try {
    const result = await applyStockOpname(id, session.data);
    if (!result) {
      cache.abandon();
      return fail(404, "OPNAME_NOT_FOUND", "Stok opname tidak ditemukan.");
    }
    cache.commit(result);
    return ok(result);
  } catch (error) {
    cache.abandon();
    return fail(
      409,
      "OPNAME_APPLY_FAILED",
      error instanceof Error ? error.message : "Apply opname gagal.",
    );
  }
}
