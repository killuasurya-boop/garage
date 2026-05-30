import { fail, ok } from "@/lib/api-response";
import { rejectStockOpname } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["inventory:write", "approvals:decide"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  try {
    const result = await rejectStockOpname(id, session.data);
    if (!result) return fail(404, "OPNAME_NOT_FOUND", "Stok opname tidak ditemukan.");
    return ok(result);
  } catch (error) {
    return fail(
      409,
      "OPNAME_REJECTION_FAILED",
      error instanceof Error ? error.message : "Reject opname gagal.",
    );
  }
}
