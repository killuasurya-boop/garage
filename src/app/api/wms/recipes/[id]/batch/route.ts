import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { calculateRecipeBatch } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ targetQty: z.number().positive().max(100_000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const result = await calculateRecipeBatch(id, parsed.data.targetQty);
  if (!result) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok(result);
}
