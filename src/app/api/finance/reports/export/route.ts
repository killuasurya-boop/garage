import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { PERIOD_KEYS } from "@/lib/finance-control-core";
import { EXPORT_FORMATS, REPORT_TYPES, exportFinanceReport } from "@/lib/finance-reports";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const schema = z.object({
  type: z.enum(REPORT_TYPES),
  format: z.enum(EXPORT_FORMATS),
  period: z.enum(PERIOD_KEYS).default("this_month"),
  from: dateKey,
  to: dateKey,
});

// POST /api/finance/reports/export → file PDF / Excel / CSV (PRD §50, §55).
export async function POST(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const body = await readJson(request, schema);
  if (body.error) {
    return body.error;
  }
  try {
    const file = await exportFinanceReport(body.data);
    return new Response(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[finance/reports/export]", error);
    return fail(500, "EXPORT_FAILED", "Gagal membuat file laporan.");
  }
}
