import { fail, ok } from "@/lib/api-response";
import { getWmsRecipeVersionDetail } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { versionId } = await context.params;
  const detail = await getWmsRecipeVersionDetail(versionId);
  if (!detail) return fail(404, "NOT_FOUND", "Versi resep tidak ditemukan.");
  return ok(detail);
}
