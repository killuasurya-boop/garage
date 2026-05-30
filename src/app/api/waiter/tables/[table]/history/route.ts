import { fail, ok } from "@/lib/api-response";
import { getTableHistoryToday } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function normalizeTable(table: string) {
  if (!/^\d{1,2}$/.test(table) || Number(table) < 1 || Number(table) > 50) {
    return null;
  }
  return String(Number(table)).padStart(2, "0");
}

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
  const tableNumber = normalizeTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  return ok(await getTableHistoryToday(tableNumber));
}
