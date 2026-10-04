import { fail, ok } from "@/lib/api-response";
import { getTableHistoryToday } from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Riwayat semua order di meja ini sepanjang hari (lintas sesi/clean).
// Untuk handover shift & verifikasi MIXED — lebih lengkap dari
// `bills` di getTableLiveData yang hanya cakup sesi aktif.
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

  return ok(await getTableHistoryToday(tableNumber, session.data.profile.outlet.id));
}
