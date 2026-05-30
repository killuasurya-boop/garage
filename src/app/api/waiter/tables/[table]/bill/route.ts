import { fail, ok } from "@/lib/api-response";
import { getTableLiveData, updateCustomerOrderStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function normalizeTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }
  return String(Number(table)).padStart(2, "0");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("orders:manage");
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
  if (!row?.currentOrderId) {
    return fail(409, "TABLE_HAS_NO_ACTIVE_ORDER", "Meja belum punya order aktif.");
  }

  try {
    const result = await updateCustomerOrderStatus(
      row.currentOrderId,
      { action: "request_bill" },
      session.data,
    );
    if (!result) {
      return fail(404, "ORDER_NOT_FOUND", "Order aktif meja tidak ditemukan.");
    }

    return ok(result);
  } catch (error) {
    return fail(
      400,
      "WAITER_BILL_REQUEST_FAILED",
      error instanceof Error ? error.message : "Request bill gagal diproses.",
    );
  }
}
