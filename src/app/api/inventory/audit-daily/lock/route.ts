import { fail, ok } from "@/lib/api-response";
import {
  getWarehouseDailyReportLock,
  listWarehouseDailyReportLocks,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return fail(400, "INVALID_MONTH", "Bulan harus format YYYY-MM.");
    }
    return ok(await listWarehouseDailyReportLocks({ month, garage: session.data }));
  }

  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(400, "INVALID_DATE", "Tanggal harus format YYYY-MM-DD.");
  }

  return ok({ lock: await getWarehouseDailyReportLock(date, session.data) });
}

export async function POST() {
  return legacyInventoryGone("Laporan gudang (/warehouse/reports)");
}

export async function DELETE() {
  return legacyInventoryGone("Laporan gudang (/warehouse/reports)");
}
