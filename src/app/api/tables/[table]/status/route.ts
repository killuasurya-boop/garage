import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  getTableLiveRow,
  getUndeliveredProductionForTable,
  undeliveredProductionMessage,
  updateTableStatus,
} from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const tableStatusSchema = z.object({
  status: z.enum(["empty", "pending", "accepted", "paid", "ready", "needs_cleaning", "rejected"]),
  currentOrderId: z.string().uuid().nullable().optional(),
  needsCleaning: z.boolean().optional(),
});

// Status yang diturunkan dari order — hanya sah bila menunjuk order milik meja ini.
const ORDER_DERIVED_STATUSES = new Set(["pending", "accepted", "paid", "ready", "rejected"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:read");
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

  return ok(row);
}

// Ubah status meja manual (mis. "Tandai Bersih" di POS). Memakai guard yang sama
// dengan siklus waiter: meja dengan bill belum lunas / produksi belum diantar
// tidak boleh dikosongkan, dan order yang dirujuk harus milik meja ini.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, tableStatusSchema);
  if (body.error) {
    return body.error;
  }

  const { table } = await context.params;
  const tableNumber = parseTableNumber(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", TABLE_NUMBER_RANGE_MESSAGE);
  }

  const outletId = session.data.profile.outlet.id;
  const row = await getTableLiveRow(tableNumber, outletId);
  if (!row) {
    return fail(404, "TABLE_NOT_FOUND", "Meja tidak ditemukan.");
  }

  const { status, currentOrderId } = body.data;
  if (status === "empty" || status === "needs_cleaning") {
    if (row.openBillCount > 0) {
      return fail(
        409,
        "TABLE_HAS_OPEN_BILL",
        `${row.tableLabel} masih punya ${row.openBillCount} bill belum lunas. Bayar atau batalkan dulu.`,
      );
    }
    if (status === "empty") {
      const undelivered = await getUndeliveredProductionForTable(tableNumber, outletId);
      if (undelivered.length) {
        return fail(409, "TABLE_HAS_UNDELIVERED", undeliveredProductionMessage(undelivered));
      }
    }
  }

  if (ORDER_DERIVED_STATUSES.has(status)) {
    if (!currentOrderId || !row.bills.some((bill) => bill.id === currentOrderId)) {
      return fail(
        400,
        "TABLE_ORDER_MISMATCH",
        "Order tidak ditemukan di sesi meja ini. Muat ulang peta meja lalu coba lagi.",
      );
    }
  }

  return ok(await updateTableStatus(tableNumber, body.data, session.data));
}
