import { fail, ok } from "@/lib/api-response";
import { restoreWmsRecipeVersion } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id, versionId } = await context.params;
  try {
    const restored = await restoreWmsRecipeVersion(id, versionId, {
      id: session.data.user.id,
      name: session.data.user.name,
    });
    if (!restored) return fail(404, "NOT_FOUND", "Versi resep tidak ditemukan.");
    return ok(restored);
  } catch (e) {
    return fail(400, "RESTORE_FAILED", e instanceof Error ? e.message : "Gagal restore versi.");
  }
}
