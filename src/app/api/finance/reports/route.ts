import { ok } from "@/lib/api-response";
import { EXPORT_FORMATS, REPORT_LABEL, REPORT_TYPES } from "@/lib/finance-reports";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Daftar laporan yang bisa diexport (PRD §55).
export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  return ok({
    reports: REPORT_TYPES.map((type) => ({ type, label: REPORT_LABEL[type] })),
    formats: EXPORT_FORMATS,
  });
}
