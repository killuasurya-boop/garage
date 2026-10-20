import { fail, ok } from "@/lib/api-response";
import { archiveWmsRecipe, getWmsRecipe } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await getWmsRecipe(id);
  if (!rec) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
  return ok(rec);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  // Resep tidak pernah dihapus permanen (versi, audit & histori HPP ikut hilang):
  // "hapus" = arsip, hanya Owner/Manajer.
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const row = await archiveWmsRecipe(id, { id: session.data.user.id, name: session.data.user.name });
    if (!row) return fail(404, "RECIPE_NOT_FOUND", "Resep tidak ditemukan.");
    return ok({ id: row.id, archived: true });
  } catch (e) {
    return fail(400, "RECIPE_ARCHIVE_FAILED", e instanceof Error ? e.message : "Gagal mengarsipkan resep.");
  }
}
