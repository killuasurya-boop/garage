// Pusat Laporan: katalog laporan per modul + satu pintu render (PDF/XLSX/CSV)
// dengan nama file standar GARAGE_{JENIS}[_{DIVISI}]_{PERIODE}.{ext}.
import { buildFinanceReport, type ReportType as FinanceType } from "@/lib/finance-reports";
import { renderReport, type ExportFormat, type ReportDoc } from "@/lib/report-engine";
import { findReportType, type ReportModule } from "@/lib/reports/catalog";
import { divisionFileTag, type ReportDivision, type ReportRange } from "@/lib/reports/common";
import { buildInventoryReport } from "@/lib/reports/inventory";
import { buildProductionReport } from "@/lib/reports/production";
import { buildPurchaseReport } from "@/lib/reports/purchases";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";
import { buildSalesExportReport } from "@/lib/reports/sales";
import type { SalesGranularity } from "@/lib/sales-report";

export { findReportType, REPORT_CATALOG, REPORT_MODULES, type ReportModule } from "@/lib/reports/catalog";

export type ReportRequest = {
  module: ReportModule;
  type: string;
  range: ReportRange;
  division: ReportDivision;
  outletId: string;
  outletName?: string | null;
};

export async function buildModuleReport(request: ReportRequest): Promise<ReportDoc> {
  const { module, type, range, division, outletId, outletName } = request;
  switch (module) {
    case "penjualan":
      return buildSalesExportReport({ outletId, outletName, range, granularity: type as SalesGranularity });
    case "pembelian":
      return buildPurchaseReport({ range, division, outletName });
    case "stok":
      return buildInventoryReport({ range, division, outletName });
    case "produksi":
      return buildProductionReport({ range, division, outletName });
    case "keuangan": {
      if (type === "rekonsiliasi") return buildReconciliationReport({ outletId, outletName, range });
      if (type === "pembayaran-supplier") {
        const report = await buildPurchaseReport({ range, division: "semua", outletName });
        return { ...report, title: "Laporan Pembayaran Supplier" };
      }
      const finance = await buildFinanceReport({ type: type as FinanceType, period: "custom", from: range.from, to: range.to });
      return { ...finance, division: null, outletName: outletName ?? null };
    }
  }
}

export async function exportModuleReport(request: ReportRequest & { format: ExportFormat }) {
  const entry = findReportType(request.module, request.type);
  if (!entry) throw new Error("Jenis laporan tidak dikenal.");
  const report = await buildModuleReport(request);
  return renderReport(report, request.format, {
    kind: entry.kind,
    division: entry.division ? divisionFileTag(request.division) : null,
    from: request.range.from,
    to: request.range.to,
  });
}
