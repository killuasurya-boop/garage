import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updateWmsRecipeSop } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  steps: z
    .array(
      z.object({
        order: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200),
        durationMin: z.number().nonnegative().max(9999).optional().default(0),
        notes: z.string().trim().max(500).optional().default(""),
      }),
    )
    .max(30),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const steps = parsed.data.steps.map((s, i) => ({
      order: s.order ?? i + 1,
      title: s.title,
      durationMin: s.durationMin,
      notes: s.notes,
    }));
    const rec = await updateWmsRecipeSop(id, steps, {
      id: session.data.user.id,
      name: session.data.user.name,
    });
    if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "SOP_UPDATE_FAILED", e instanceof Error ? e.message : "Gagal simpan SOP.");
  }
}
