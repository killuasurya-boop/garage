import { z } from "zod";

import { fail } from "@/lib/api-response";
import { todayWibKey, validateDateRange } from "@/lib/date-range";
import { reportDownloadResponse, reportToPdf, reportToXlsx } from "@/lib/report-engine";
import { parseCatalogQuery } from "@/lib/product-catalog-query";
import { PRODUCT_EXPORT_TYPES, productExportFileName, type ProductExportType } from "@/lib/product-catalog-types";
import { auditProductExport } from "@/lib/product-management";
import { buildProductReport } from "@/lib/reports/products";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(PRODUCT_EXPORT_TYPES.map((entry) => entry.id) as [ProductExportType, ...ProductExportType[]]),
  format: z.enum(["xlsx", "pdf"]),
});

/**
 * GET /api/products/export?type=master&format=xlsx&<filter katalog>
 * → GarageOS_Master_Produk_YYYY-MM-DD.xlsx/pdf berisi SEMUA baris sesuai filter.
 * Owner/Manajer saja (memuat harga modal, HPP & margin).
 */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ type: params.get("type"), format: params.get("format") });
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Jenis laporan atau format tidak valid.");
  const query = parseCatalogQuery(params);
  if (!query.ok) return fail(400, "VALIDATION_ERROR", query.message);
  if (query.query.from) {
    const range = validateDateRange(query.query.from, query.query.to, { maxDays: 366 });
    if (!range.ok) return fail(400, range.code, range.message);
  }
  try {
    const { doc, rowCount } = await buildProductReport({
      type: parsed.data.type,
      query: query.query,
      generatedBy: `${session.data.user.name} (${session.data.profile.role})`,
      outletName: session.data.profile.outlet.name,
    });
    const body = parsed.data.format === "xlsx" ? await reportToXlsx(doc) : await reportToPdf(doc);
    await auditProductExport(session.data, {
      type: parsed.data.type,
      format: parsed.data.format,
      rows: rowCount,
      filters: doc.filters ?? [],
    });
    return reportDownloadResponse({
      body,
      filename: productExportFileName(parsed.data.type, todayWibKey(), parsed.data.format),
      contentType:
        parsed.data.format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
    });
  } catch (error) {
    console.error("[products/export]", error);
    return fail(500, "EXPORT_FAILED", "Gagal membuat file laporan produk.");
  }
}
