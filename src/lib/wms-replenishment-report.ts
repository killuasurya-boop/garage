import { periodLabelFor, type ReportDoc } from "@/lib/report-engine";
import type { ClosingFilters } from "@/lib/wms-replenishment-types";

type ClosingReportLine = {
  doc: string; division: string; businessDate: string; neededDate: string; status: string;
  sku: string; name: string; unit: string; systemQty: number; physicalQty: number | null;
  variance: number | null; requestedQty: number; approvedQty: number; dispatchedQty: number;
  completedAt?: string | Date | null; fulfillmentTiming?: string; receivedQty: number; damagedQty: number; shortageQty: number; estimatedCost: number;
};
export type ClosingReportData = {
  generatedAt: string; totalRequests: number; lateRequests: number; openRequests: number;
  lines: ClosingReportLine[];
};

/** One source document drives JSON and every export format; never sum mixed material units. */
export function buildClosingReport(data: ClosingReportData, filters: ClosingFilters, generator: { name: string; outletName: string }): ReportDoc {
  const division = filters.division === "bar" ? "Bar" : filters.division === "dapur" ? "Dapur" : "Bar dan Dapur";
  const period = filters.neededDate ?? (filters.from && filters.to ? periodLabelFor(filters.from, filters.to) : filters.businessDate ?? "Semua tanggal sesuai filter");
  const identity = [
    { key: "doc", label: "Dokumen", type: "text" as const, weight: 1.6 },
    { key: "division", label: "Divisi", type: "text" as const },
    { key: "neededDate", label: "Dibutuhkan", type: "date" as const },
    { key: "sku", label: "Kode bahan", type: "text" as const },
    { key: "name", label: "Bahan", type: "text" as const, weight: 2 },
    { key: "unit", label: "Satuan", type: "text" as const },
  ];
  const rows = data.lines.map((l) => ({ ...l, completedAt:l.completedAt ? new Date(l.completedAt).toISOString() : null, fulfillmentTiming:l.fulfillmentTiming ?? "", division: l.division === "bar" ? "Bar" : "Dapur" }));
  const quantity = (key: string, label: string) => ({ key, label, type: "qty" as const, noSum: true });
  return {
    title: "Closing Stock & Pemenuhan Bahan",
    division,
    periodLabel: period,
    outletName: generator.outletName,
    generatedAt: data.generatedAt,
    generatedBy: generator.name,
    showLogo: true,
    orientation: "landscape",
    summary: [
      { label: "Pembuat laporan", value: generator.name },
      { label: "Permintaan", value: String(data.totalRequests) },
      { label: "Belum selesai", value: String(data.openRequests) },
      { label: "Permintaan terlambat", value: String(data.lateRequests) },
    ],
    filters: Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`),
    notes: [
      "Garage Coffee · Zona waktu Asia/Jakarta (WIB). Pemenuhan tepat waktu bila penerimaan selesai sebelum jam mulai operasional pada tanggal kebutuhan.",
      "Stok aktual adalah hasil pemeriksaan; laporan ini tidak mengubah saldo stok.",
      "Jumlah bahan dengan satuan berbeda tidak dijumlahkan. Estimasi pembelian bukan pembayaran atau biaya yang sudah diposting.",
      "Baris tanpa hitungan aktual tetap kosong, bukan nol. Laporan memuat seluruh baris yang sesuai filter dan hak akses.",
    ],
    tables: [
      { title: "Pemeriksaan closing", columns: [...identity, { key: "businessDate", label: "Operasional", type: "date" }, quantity("systemQty", "Tercatat"), quantity("physicalQty", "Aktual"), quantity("variance", "Selisih")], rows, maxLines: 4 },
      { title: "Permintaan dan pemenuhan", columns: [...identity, quantity("requestedQty", "Diminta"), quantity("approvedQty", "Disetujui"), quantity("dispatchedQty", "Dikirim"), quantity("receivedQty", "Diterima"), {key:"fulfillmentTiming",label:"Pemenuhan",type:"text"}], rows, maxLines: 4 },
      { title: "Kekurangan dan pengecualian", columns: [...identity, { key: "status", label: "Status", type: "text" }, quantity("damagedQty", "Rusak"), quantity("shortageQty", "Kurang"), { key: "estimatedCost", label: "Estimasi biaya", type: "money" }], rows, maxLines: 4 },
    ],
  };
}

/** CSV spreadsheet clients must not execute material names as formulas. Numeric amounts stay numeric. */
export function protectClosingCsv(report: ReportDoc): ReportDoc {
  const safe = (value: string) => /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return {
    ...report,
    summary: report.summary.map((entry) => ({ label: safe(entry.label), value: safe(entry.value) })),
    tables: report.tables.map((table) => ({ ...table, rows: table.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safe(value) : value]))) })),
  };
}
