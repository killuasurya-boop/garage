import { menuImportTemplate } from "@/lib/menu-import";
import { reportDownloadResponse } from "@/lib/report-engine";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** GET /api/menu/import/template?format=xlsx|csv → template impor produk menu. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  return reportDownloadResponse({
    body: await menuImportTemplate(format),
    filename: `GARAGE_TEMPLATE_IMPOR_PRODUK_MENU.${format}`,
    contentType: format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
