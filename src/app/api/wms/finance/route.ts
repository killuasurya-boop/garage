import { ok } from "@/lib/api-response";
import { getWmsFinanceOverview } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  // HPP, food cost & nilai stok = data keuangan (bukan untuk akun kasir/bar/dapur).
  const session = await requirePermission("finance:read");
  if (session.response) return session.response;
  return ok(await getWmsFinanceOverview());
}
