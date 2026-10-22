import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { approveDraftRecipe, MasterImportError, rejectDraftRecipe } from "@/lib/master-import";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
]);

// Setujui (aktif: potong stok + HPP varian) atau tolak (arsip) resep draft satu menu.
export async function POST(request: Request, context: { params: Promise<{ menuItemId: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { menuItemId } = await context.params;
  const actor = { id: session.data.user.id, name: session.data.user.name };
  try {
    return ok(
      parsed.data.action === "approve"
        ? await approveDraftRecipe(menuItemId, actor)
        : await rejectDraftRecipe(menuItemId, parsed.data.reason, actor),
    );
  } catch (e) {
    if (e instanceof MasterImportError) return fail(409, "DRAFT_RECIPE_CONFLICT", e.message);
    return fail(400, "DRAFT_RECIPE_FAILED", e instanceof Error ? e.message : "Gagal memproses resep draft.");
  }
}
