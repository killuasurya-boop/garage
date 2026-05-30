import { fail, ok } from "@/lib/api-response";
import { getTableLiveData, updateTableStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function normalizeTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }
  return String(Number(table)).padStart(2, "0");
}

// Tandai meja sudah dibersihkan ke status "empty" + needsCleaning=false.
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
  const tableNumber = normalizeTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  const rows = await getTableLiveData();
  const row = rows.find((item) => item.tableNumber === tableNumber);
  if (!row) {
    return fail(404, "TABLE_NOT_FOUND", "Meja tidak ditemukan.");
  }

  const canClear =
    row.status === "paid" ||
    row.status === "rejected" ||
    row.status === "needs_cleaning" ||
    !row.currentOrderId;
  if (!canClear) {
    return fail(
      409,
      "TABLE_HAS_ACTIVE_ORDER",
      "Meja masih punya order aktif. Selesaikan bill sebelum ditandai bersih.",
    );
  }

  const updated = await updateTableStatus(
    tableNumber,
    { status: "empty", needsCleaning: false, currentOrderId: null },
    session.data,
  );
  return ok(updated);
}
