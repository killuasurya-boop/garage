import { fail, ok } from "@/lib/api-response";
import { duplicateWmsRecipe } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await duplicateWmsRecipe(id, {
    id: session.data.user.id,
    name: session.data.user.name,
  });
  if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok(rec, { status: 201 });
}
