import { fail, ok } from "@/lib/api-response";
import {
  getTableLiveRow,
  getUndeliveredProductionForTable,
  undeliveredProductionMessage,
  updateTableStatus,
} from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Tandai meja sudah dibersihkan ke status "empty" (AVAILABLE) + needsCleaning=false.
// Dipakai dari DIRTY/CLEANING (atau meja lunas) — siklus lengkap di /lifecycle.
// Sesuai pola updateTableStatus: status="empty" otomatis set cleanedAt=now
// dan currentOrderId=null.
export async function POST(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:write");
  if (session.response) {
    return session.response;
  }

  const { table } = await context.params;
  const tableNumber = parseTableNumber(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", TABLE_NUMBER_RANGE_MESSAGE);
  }

  const row = await getTableLiveRow(tableNumber, session.data.profile.outlet.id);
  if (!row) {
    return fail(404, "TABLE_NOT_FOUND", "Meja tidak ditemukan.");
  }

  const canClear =
    row.status === "paid" ||
    row.status === "rejected" ||
    row.status === "needs_cleaning" ||
    row.status === "cleaning" ||
    !row.currentOrderId;
  if (!canClear) {
    return fail(
      409,
      "TABLE_HAS_ACTIVE_ORDER",
      "Meja masih punya order aktif. Selesaikan bill sebelum ditandai bersih.",
    );
  }
  const undelivered = await getUndeliveredProductionForTable(tableNumber, session.data.profile.outlet.id);
  if (undelivered.length) {
    return fail(409, "TABLE_HAS_UNDELIVERED", undeliveredProductionMessage(undelivered));
  }

  const updated = await updateTableStatus(
    tableNumber,
    { status: "empty", needsCleaning: false, currentOrderId: null },
    session.data,
  );
  return ok(updated);
}
