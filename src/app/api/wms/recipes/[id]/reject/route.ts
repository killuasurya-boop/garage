import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { rejectRecipeToDraft } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().trim().max(200).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const rec = await rejectRecipeToDraft(
      id,
      { id: session.data.user.id, name: session.data.user.name },
      parsed.data.note,
    );
    if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "REJECT_FAILED", e instanceof Error ? e.message : "Gagal reject.");
  }
}
