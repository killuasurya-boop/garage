import { fail, ok } from "@/lib/api-response";
import { archiveWmsRecipe } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const rec = await archiveWmsRecipe(id, {
      id: session.data.user.id,
      name: session.data.user.name,
    });
    if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "ARCHIVE_FAILED", e instanceof Error ? e.message : "Gagal archive resep.");
  }
}
