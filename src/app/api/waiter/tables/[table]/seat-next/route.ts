import { fail, ok } from "@/lib/api-response";
import { getTableLiveRow, updateTableStatus } from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// "Tamu Baru di meja ini" — teman gabung setelah bill sebelumnya lunas.
// Bedanya dengan /clean: cleanedAt TIDAK direset, supaya bill lunas
// sebelumnya tetap masuk dalam window sesi → aggregate getTableLiveData
// akan mendeteksi status MIXED ketika order baru dibuat di meja ini.
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

  // Hanya valid kalau setidaknya ada bill lunas di sesi ini — kalau tidak,
  // tidak ada bedanya dengan /clean.
  const canSeatNext =
    row.status === "paid" || (row.paidBillCount ?? 0) > 0;
  if (!canSeatNext) {
    return fail(
      409,
      "SEAT_NEXT_NOT_APPLICABLE",
      "Belum ada bill lunas di sesi meja ini. Gunakan POS untuk order baru.",
    );
  }

  const updated = await updateTableStatus(
    tableNumber,
    {
      status: "empty",
      needsCleaning: false,
      currentOrderId: null,
      preserveCleanedAt: true,
    },
    session.data,
  );
  return ok(updated);
}
