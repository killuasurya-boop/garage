import { fail, ok } from "@/lib/api-response";
import { toggleWmsRecipeFavorite } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await toggleWmsRecipeFavorite(id);
  if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok({ id: rec.id, isFavorite: rec.isFavorite });
}
