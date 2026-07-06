import { ok } from "@/lib/api-response";
import { getRecipeDependents } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/** PRD §15 — menu resep yang memakai sub-recipe produksi ini. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  return ok(await getRecipeDependents(id));
}
