import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { deleteMenuResearch, updateMenuResearch } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  productName: z.string().trim().min(2).max(140).optional(),
  tasteNotes: z.string().trim().max(2000).optional(),
  recipeNotes: z.string().trim().max(2000).optional(),
  hppNotes: z.string().trim().max(1000).optional(),
  sellingPriceNotes: z.string().trim().max(1000).optional(),
  decision: z.enum(["research", "revise", "approved", "rejected"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;

  const row = await updateMenuResearch(id, parsed.data);
  if (!row) return fail(404, "NOT_FOUND", "Catatan riset tidak ditemukan.");
  return ok(row);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const { id } = await context.params;
  const row = await deleteMenuResearch(id);
  if (!row) return fail(404, "NOT_FOUND", "Catatan riset tidak ditemukan.");
  return ok({ id: row.id });
}
