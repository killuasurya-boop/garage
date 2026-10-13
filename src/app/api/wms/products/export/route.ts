import { getWmsProducts, exportWmsProductsWorkbook, wmsImportTemplate } from "@/lib/wms-service";
import { todayWibKey } from "@/lib/date-range";
import { renderReport, reportDownloadResponse, sumRows, type ReportColumn } from "@/lib/report-engine";
import { reportFileName } from "@/lib/report-file-name";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function download(body: Buffer, filename: string, contentType: string) {
  return reportDownloadResponse({ body, filename, contentType });
}

/**
 * GET /api/wms/products/export
 *   ?format=xlsx (default, bisa diedit & diimpor balik) | csv | pdf (laporan standar)
 *   ?template=1 → template impor (xlsx/csv) dengan petunjuk & daftar kategori.
 */
export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const template = url.searchParams.get("template") === "1";
  const today = todayWibKey();

  if (template) {
    const kind = format === "csv" ? "csv" : "xlsx";
    const body = await wmsImportTemplate(kind);
    return download(body, `GARAGE_TEMPLATE_IMPOR_BAHAN_BAKU.${kind}`, kind === "csv" ? "text/csv; charset=utf-8" : XLSX);
  }

  if (format === "pdf" || format === "csv") {
    const products = await getWmsProducts();
    const columns: ReportColumn[] = [
      { key: "sku", label: "SKU", type: "text", weight: 0.9 },
      { key: "name", label: "Nama bahan", type: "text", weight: 2 },
      { key: "category", label: "Kategori", type: "text", weight: 1.3 },
      { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
      { key: "onHand", label: "Stok", type: "qty", noSum: true },
      { key: "minStock", label: "Min", type: "qty", noSum: true },
      { key: "hpp", label: "HPP/satuan", type: "price" },
      { key: "value", label: "Nilai stok", type: "money" },
    ];
    const rows = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      onHand: p.onHand,
      minStock: p.minStock,
      hpp: p.hpp,
      value: Math.round(Math.max(0, p.onHand) * p.hpp),
    }));
    const file = await renderReport(
      {
        title: "Daftar Bahan Baku Gudang",
        periodLabel: `Posisi ${today}`,
        outletName: session.data.profile.outlet.name,
        generatedAt: new Date().toISOString(),
        summary: [
          { label: "Jumlah bahan", value: String(rows.length) },
          { label: "Nilai stok", value: `Rp${new Intl.NumberFormat("id-ID").format(rows.reduce((s, r) => s + r.value, 0))}` },
        ],
        tables: [{ title: "Bahan baku", columns, rows, totals: sumRows(rows, columns, { key: "sku", text: "TOTAL" }) }],
        notes: ["Stok = total semua ruang gudang. Nilai stok = stok × HPP rata-rata (stok minus dinilai nol)."],
      },
      format,
      { kind: "PRODUK_GUDANG", from: today, to: today },
    );
    return download(file.body, file.filename, file.contentType);
  }

  const buffer = await exportWmsProductsWorkbook();
  return download(buffer, reportFileName({ kind: "PRODUK_GUDANG", from: today, to: today, ext: "xlsx" }), XLSX);
}
