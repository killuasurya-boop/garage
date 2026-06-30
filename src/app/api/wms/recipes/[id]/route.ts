import { fail, ok } from "@/lib/api-response";
import { deleteWmsRecipe, getWmsRecipe } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await getWmsRecipe(id);
  if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok(rec);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const row = await deleteWmsRecipe(id);
  if (!row) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok({ id: row.id });
}
