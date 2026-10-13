import { z } from "zod";

import { fail } from "@/lib/api-response";
import { validateDateRange } from "@/lib/date-range";
import { EXPORT_FORMATS, reportDownloadResponse } from "@/lib/report-engine";
import { REPORT_DIVISIONS } from "@/lib/reports/common";
import { exportModuleReport, findReportType, REPORT_MODULES } from "@/lib/reports";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  module: z.enum(REPORT_MODULES),
  type: z.string().min(1).max(40),
  format: z.enum(EXPORT_FORMATS),
  from: z.string(),
  to: z.string(),
  division: z.enum(REPORT_DIVISIONS).default("semua"),
});

/**
 * GET /api/reports/export?module=pembelian&type=detail&division=bar&from=…&to=…&format=pdf
 * → file PDF / XLSX / CSV dengan format standar Garage (Pusat Laporan).
 * GET supaya bisa diunduh langsung lewat tautan (nama file dari server).
 */
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) return session.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  const input = parsed.data;
  if (!findReportType(input.module, input.type)) {
    return fail(400, "UNKNOWN_REPORT", "Jenis laporan tidak dikenal untuk modul ini.");
  }
  const range = validateDateRange(input.from, input.to, { maxDays: 366 });
  if (!range.ok) return fail(400, range.code, range.message);

  try {
    const file = await exportModuleReport({
      module: input.module,
      type: input.type,
      format: input.format,
      division: input.division,
      range: { from: range.from, to: range.to },
      outletId: session.data.profile.outlet.id,
      outletName: session.data.profile.outlet.name,
    });
    return reportDownloadResponse(file);
  } catch (error) {
    console.error("[reports/export]", error);
    return fail(500, "EXPORT_FAILED", "Gagal membuat file laporan. Coba lagi atau persempit rentang tanggal.");
  }
}
