import { fail, ok } from "@/lib/api-response";
import { getTableLiveRow, updateCustomerOrderStatus } from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const { table } = await context.params;
  const tableNumber = parseTableNumber(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", TABLE_NUMBER_RANGE_MESSAGE);
  }

  const row = await getTableLiveRow(tableNumber, session.data.profile.outlet.id);
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
