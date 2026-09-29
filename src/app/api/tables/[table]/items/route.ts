import { fail, ok } from "@/lib/api-response";
import { getTableOrderItems } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function normalizeRouteTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }

  return String(Number(table)).padStart(2, "0");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:read");
  if (session.response) {
    return session.response;
  }

  const { table } = await context.params;
  const tableNumber = normalizeRouteTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  return ok(await getTableOrderItems(tableNumber));
}
