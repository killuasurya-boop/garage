import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { listProductionRecipes, listProductions, runProduction } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const runSchema = z.object({
  recipeId: z.string().uuid(),
  batches: z.number().positive().max(100000),
  warehouseId: z.string().uuid(),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const [recipes, history] = await Promise.all([listProductionRecipes(), listProductions()]);
  return ok({ recipes, history });
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, runSchema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await runProduction(parsed.data, session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "PRODUCTION_FAILED", e instanceof Error ? e.message : "Gagal produksi.");
  }
}
