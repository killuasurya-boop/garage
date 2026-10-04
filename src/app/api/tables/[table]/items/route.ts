import { fail, ok } from "@/lib/api-response";
import { getTableOrderItems } from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

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

  return ok(await getTableOrderItems(tableNumber, session.data.profile.outlet.id));
}
