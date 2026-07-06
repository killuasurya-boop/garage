import { ok } from "@/lib/api-response";
import { listWmsIngredientLibrary, type WmsIngredientType } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const TYPES = new Set<WmsIngredientType>(["raw", "packaging", "semi_finished", "finished", "consumable"]);

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type = typeParam && TYPES.has(typeParam as WmsIngredientType) ? (typeParam as WmsIngredientType) : undefined;
  const q = url.searchParams.get("q") ?? undefined;
  return ok(await listWmsIngredientLibrary({ type, q }));
}
