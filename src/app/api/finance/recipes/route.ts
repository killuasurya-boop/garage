import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createMenuRecipe } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const recipeSchema = z.object({
  menuItemId: z.string().trim().min(2).max(120),
  variantId: z.string().trim().min(1).max(80).optional(),
  inventorySku: z.string().trim().min(2).max(80),
  qty: z.number().positive(),
  unit: z.string().trim().min(1).max(40),
  wastePct: z.number().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, recipeSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createMenuRecipe(body.data, session.data), { status: 201 });
}
