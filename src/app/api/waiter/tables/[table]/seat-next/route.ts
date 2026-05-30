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
  const tableNumber = normalizeTable(table);
  if (!tableNumber) {
    return fail(400, "TABLE_INVALID", "Nomor meja harus 01 sampai 50.");
  }

  const rows = await getTableLiveData();
  const row = rows.find((item) => item.tableNumber === tableNumber);
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
