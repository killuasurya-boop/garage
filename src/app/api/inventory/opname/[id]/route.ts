import { fail, ok } from "@/lib/api-response";
import { getStockOpnameDetail } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const detail = await getStockOpnameDetail(id);
  if (!detail) {
    return fail(404, "OPNAME_NOT_FOUND", "Stok opname tidak ditemukan.");
  }

  return ok(detail);
}
