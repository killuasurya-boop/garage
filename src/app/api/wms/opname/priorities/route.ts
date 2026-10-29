import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getCycleCountPriorities } from "@/lib/wms-cycle-count";

export const runtime = "nodejs";

// Skor memuat nilai stok & riwayat selisih → hanya Owner/Manajer (penghitung tetap blind).
const ROLES = ["Owner", "Manajer"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await requireGarageSession([...ROLES]);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId") ?? "";
  if (!UUID.test(warehouseId)) return fail(400, "WAREHOUSE_INVALID", "Pilih ruang gudang.");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  return ok(await getCycleCountPriorities(warehouseId, { limit }));
}
