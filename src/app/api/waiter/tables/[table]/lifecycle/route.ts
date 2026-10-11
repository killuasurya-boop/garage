import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  getTableLiveRow,
  getUndeliveredProductionForTable,
  releaseTableHoldByStaff,
  undeliveredProductionMessage,
  updateTableStatus,
} from "@/lib/garage-service";
import { TABLE_NUMBER_RANGE_MESSAGE, parseTableNumber } from "@/lib/garage-tables";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Siklus meja Production Hub / Workflow §12:
// AVAILABLE → OCCUPIED → DIRTY → CLEANING → AVAILABLE (+ RESERVED).
// Status tidak berubah hanya karena pembayaran — perlu event "tamu pergi".
// CLEANING → AVAILABLE memakai /clean (sudah ada).
const lifecycleSchema = z.object({
  action: z.enum(["leave", "start_cleaning", "reserve", "unreserve", "release_hold"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const session = await requirePermission("tables:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, lifecycleSchema);
  if (body.error) {
    return body.error;
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

  const openBills = row.openBillCount ?? 0;
  const dirty = row.needsCleaning || row.status === "needs_cleaning";

  switch (body.data.action) {
    case "leave": {
      // Tamu pergi → DIRTY. Bill aktif harus lunas dulu.
      if (openBills > 0 || ["pending", "accepted", "ready", "awaiting_payment", "mixed"].includes(row.status)) {
        return fail(409, "TABLE_HAS_OPEN_BILL", "Masih ada bill belum lunas di meja ini.");
      }
      if (row.status === "empty" || row.status === "reserved" || row.status === "held") {
        return fail(409, "TABLE_NOT_OCCUPIED", "Meja tidak sedang terisi.");
      }
      const undelivered = await getUndeliveredProductionForTable(tableNumber, session.data.profile.outlet.id);
      if (undelivered.length) {
        return fail(409, "TABLE_HAS_UNDELIVERED", undeliveredProductionMessage(undelivered));
      }
      return ok(
        await updateTableStatus(
          tableNumber,
          { status: "needs_cleaning", needsCleaning: true, preserveCleanedAt: true },
          session.data,
        ),
      );
    }
    case "start_cleaning": {
      if (!dirty) {
        return fail(409, "TABLE_NOT_DIRTY", "Meja belum ditandai kotor (tamu pergi).");
      }
      return ok(
        await updateTableStatus(
          tableNumber,
          { status: "cleaning", needsCleaning: true, preserveCleanedAt: true },
          session.data,
        ),
      );
    }
    case "reserve": {
      if (row.status !== "empty" || row.needsCleaning) {
        return fail(409, "TABLE_NOT_AVAILABLE", "Hanya meja AVAILABLE yang bisa direservasi.");
      }
      return ok(await updateTableStatus(tableNumber, { status: "reserved" }, session.data));
    }
    case "release_hold": {
      // Pelanggan memilih meja lalu pergi tanpa pesan → staf lepas kunci kuning.
      if (row.status !== "held") {
        return fail(409, "TABLE_NOT_HELD", "Meja tidak sedang dipilih pelanggan.");
      }
      return ok(await releaseTableHoldByStaff(tableNumber, session.data));
    }
    case "unreserve": {
      if (row.status !== "reserved") {
        return fail(409, "TABLE_NOT_RESERVED", "Meja tidak sedang direservasi.");
      }
      return ok(await updateTableStatus(tableNumber, { status: "empty" }, session.data));
    }
  }
}
