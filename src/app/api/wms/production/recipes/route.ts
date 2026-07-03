import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createProductionRecipe, listProductionRecipes } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  outputProductId: z.string().uuid(),
  outputQty: z.number().positive().max(10_000_000),
  bom: z
    .array(z.object({ inputProductId: z.string().uuid(), qty: z.number().positive() }))
    .min(1)
    .max(50),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listProductionRecipes());
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return ok(await createProductionRecipe(parsed.data, session.data.user.id), { status: 201 });
}
