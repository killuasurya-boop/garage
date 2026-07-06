import { ok } from "@/lib/api-response";
import { getWmsRecipeDependencyMap } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const map = await getWmsRecipeDependencyMap(id);
  if (!map) return ok({ recipeId: id, recipeName: "", upstream: [], sharedRecipes: [], subRecipeDependents: [] });
  return ok(map);
}
