import { fail, ok } from "@/lib/api-response";
import { EXPORT_FORMATS, renderReport, reportDownloadResponse, type ExportFormat } from "@/lib/report-engine";
import { requireGarageSession } from "@/lib/server-auth";
import { getWmsLossReport } from "@/lib/wms-loss";
import { buildLossReportDoc, resolveLossPeriod, type LossPeriod } from "@/lib/wms-opname-report";
import { protectClosingCsv } from "@/lib/wms-replenishment-report";
import { getWmsWarehouseName } from "@/lib/wms-service";

export const runtime = "nodejs";

// Nilai kerugian = data manajerial sensitif → hanya Owner/Manajer.
const ROLES = ["Owner", "Manajer"] as const;
const PERIODS: LossPeriod[] = ["daily", "weekly", "monthly"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await requireGarageSession([...ROLES]);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "daily") as LossPeriod;
  if (!PERIODS.includes(period)) return fail(400, "PERIOD_INVALID", "Periode harus daily, weekly, atau monthly.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && !(EXPORT_FORMATS as readonly string[]).includes(format)) return fail(400, "FORMAT_INVALID", "Format harus json, csv, xlsx, atau pdf.");
  const warehouseId = url.searchParams.get("warehouseId");
  if (warehouseId && !UUID.test(warehouseId)) return fail(400, "WAREHOUSE_INVALID", "Ruang tidak valid.");
  let range: ReturnType<typeof resolveLossPeriod>;
  try {
    range = resolveLossPeriod(period, url.searchParams.get("date") ?? today);
  } catch (e) {
    return fail(400, "DATE_INVALID", e instanceof Error ? e.message : "Tanggal tidak valid.");
  }
  const data = await getWmsLossReport({ from: range.from, to: range.to, warehouseIds: warehouseId ? [warehouseId] : null });
  if (format === "json") return ok({ ...data, period, fromKey: range.fromKey, toKey: range.toKey });
  const warehouseLabel = warehouseId ? ((await getWmsWarehouseName(warehouseId)) ?? "Ruang") : "Semua ruang";
  const doc = buildLossReportDoc(data, { period, fromKey: range.fromKey, toKey: range.toKey, warehouseLabel, generatedBy: session.data.user.name });
  return reportDownloadResponse(
    await renderReport(format === "csv" ? protectClosingCsv(doc) : doc, format as ExportFormat, { kind: "Loss_Control", division: warehouseId ? warehouseLabel : null, from: range.fromKey, to: range.toKey }),
  );
}
