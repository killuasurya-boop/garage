import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getTableLiveData, updateTableStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const tableStatusSchema = z.object({
  status: z.enum(["empty", "pending", "accepted", "paid", "ready", "needs_cleaning", "rejected"]),
  currentOrderId: z.string().uuid().nullable().optional(),
  needsCleaning: z.boolean().optional(),
});

function normalizeRouteTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }

  return String(Number(table)).padStart(2, "0");
}

async function requireTableSession() {
  const session = await requirePermission("tables:read");
  if (session.response) {
    return session.response;
  }

  return session.data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requireTableSession();
  if (session instanceof Response) {
    return session;
  }

  const { table } = await context.params;
  const tableNumber = normalizeRouteTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  const rows = await getTableLiveData();
  const row = rows.find((item) => item.tableNumber === tableNumber);
  if (!row) {
    return fail(404, "TABLE_NOT_FOUND", "Meja tidak ditemukan.");
  }

  return ok(row);
}

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
  const tableNumber = normalizeRouteTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  return ok(await updateTableStatus(tableNumber, body.data, session.data));
}
