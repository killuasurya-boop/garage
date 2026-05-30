import { fail, ok } from "@/lib/api-response";
import { approveExpense } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "approvals:decide"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  try {
    const result = await approveExpense(id, session.data);
    if (!result) {
      return fail(404, "EXPENSE_NOT_FOUND", "Pengeluaran tidak ditemukan.");
    }
    return ok(result);
  } catch (error) {
    return fail(
      409,
      "EXPENSE_APPROVAL_FAILED",
      error instanceof Error ? error.message : "Approval pengeluaran gagal.",
    );
  }
}
