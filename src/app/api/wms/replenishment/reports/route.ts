import { fail } from "@/lib/api-response";
import { getClosingReport } from "@/lib/wms-replenishment";
import { parseReplenishmentFilters } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";
import { buildClosingReport, protectClosingCsv } from "@/lib/wms-replenishment-report";
import { renderReport, reportDownloadResponse, EXPORT_FORMATS, type ExportFormat } from "@/lib/report-engine";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const url = new URL(request.url);
  const filters = parseReplenishmentFilters(url);
  if (!filters.success) return fail(400, "FILTER_INVALID", filters.error.issues.map((i) => i.message).join("; "));
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && !(EXPORT_FORMATS as readonly string[]).includes(format)) return fail(400, "FORMAT_INVALID", "Format laporan harus json, csv, xlsx, atau pdf.");
  try {
    const data = await getClosingReport(session.actor, filters.data);
    if (format === "json") return replenishmentOk(data);
    const report = buildClosingReport(data, filters.data, { name: session.actor.name, outletName: session.actor.outletId });
    const dates = data.lines.flatMap((line) => [line.businessDate, line.neededDate]).sort();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const from = filters.data.from ?? filters.data.neededDate ?? filters.data.businessDate ?? dates[0] ?? today;
    const to = filters.data.to ?? filters.data.neededDate ?? filters.data.businessDate ?? dates.at(-1) ?? from;
    return reportDownloadResponse(await renderReport(format === "csv" ? protectClosingCsv(report) : report, format as ExportFormat, { kind: "Closing_Stock", division: filters.data.division, from, to }));
  } catch (error) { return replenishmentFailure(error); }
}
