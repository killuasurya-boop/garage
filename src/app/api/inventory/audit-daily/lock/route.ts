import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  getWarehouseDailyReportLock,
  listWarehouseDailyReportLocks,
  lockWarehouseDailyReport,
  unlockWarehouseDailyReport,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const lockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD."),
});

function canLockWarehouseReport(role: string) {
  return role === "Owner / CEO" || role === "Admin" || role === "Gudang";
}

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return fail(400, "INVALID_MONTH", "Bulan harus format YYYY-MM.");
    }
    return ok(await listWarehouseDailyReportLocks({ month, garage: session.data }));
  }

  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail(400, "INVALID_DATE", "Tanggal harus format YYYY-MM-DD.");
  }

  return ok({ lock: await getWarehouseDailyReportLock(date, session.data) });
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  if (!canLockWarehouseReport(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin/Gudang yang bisa kunci laporan harian.");
  }

  const body = await readJson(request, lockSchema);
  if (body.error) return body.error;

  try {
    return ok(await lockWarehouseDailyReport(body.data.date, session.data), { status: 201 });
  } catch (error) {
    return fail(
      400,
      "WAREHOUSE_DAILY_LOCK_FAILED",
      error instanceof Error ? error.message : "Laporan harian gagal dikunci.",
    );
  }
}

export async function DELETE(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  if (session.data.profile.role !== "Owner / CEO" && session.data.profile.role !== "Admin") {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin yang bisa reopen laporan harian.");
  }

  const body = await readJson(request, lockSchema);
  if (body.error) return body.error;

  try {
    return ok(await unlockWarehouseDailyReport(body.data.date, session.data));
  } catch (error) {
    return fail(
      400,
      "WAREHOUSE_DAILY_UNLOCK_FAILED",
      error instanceof Error ? error.message : "Laporan harian gagal dibuka ulang.",
    );
  }
}
