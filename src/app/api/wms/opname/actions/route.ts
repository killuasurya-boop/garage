import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { ACTION_STATUSES, listOpnameActions, refreshOpnameInsights, type ActionStatus } from "@/lib/wms-opname-insights";

export const runtime = "nodejs";

const ROLES = ["Owner", "Manajer"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await requireGarageSession([...ROLES]);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "active";
  if (status !== "active" && status !== "all" && !(ACTION_STATUSES as readonly string[]).includes(status)) return fail(400, "STATUS_INVALID", "Status tidak dikenal.");
  const warehouseId = url.searchParams.get("warehouseId");
  if (warehouseId && !UUID.test(warehouseId)) return fail(400, "WAREHOUSE_INVALID", "Ruang tidak valid.");
  return ok(await listOpnameActions({ status: status === "all" ? null : (status as ActionStatus | "active"), warehouseIds: warehouseId ? [warehouseId] : null }));
}

/** Hitung ulang rekomendasi dari data terbaru (hanya menambah temuan baru; tidak mengubah stok). */
export async function POST() {
  const session = await requireGarageSession([...ROLES]);
  if (session.response) return session.response;
  return ok(await refreshOpnameInsights());
}
