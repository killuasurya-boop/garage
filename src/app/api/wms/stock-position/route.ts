import { fail, ok } from "@/lib/api-response";
import { stockPositions } from "@/lib/wms-procurement";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Stok dapat dipakai / dalam perjalanan / sudah diminta per bahan — untuk form
// Permintaan Belanja (kebutuhan bersih).
export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  const area = url.searchParams.get("area");
  if (area !== "bar" && area !== "dapur" && area !== "umum") return fail(400, "AREA_INVALID", "Area harus bar, dapur, atau umum.");
  const map = await stockPositions(ids, area);
  return ok(Object.fromEntries(map));
}
