import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createWmsRecipe, listWmsRecipes } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().max(80).optional(),
  yieldQty: z.string().trim().max(40).optional(),
  sellPrice: z.number().nonnegative().max(100_000_000),
  bom: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().positive() }))
    .max(50)
    .default([]),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listWmsRecipes());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return ok(await createWmsRecipe(parsed.data), { status: 201 });
}
