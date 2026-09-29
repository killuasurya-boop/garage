import { ok } from "@/lib/api-response";
import { deleteScenario } from "@/lib/finance-intelligence";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }
  const { id } = await context.params;
  await deleteScenario(id);
  return ok({ id });
}
