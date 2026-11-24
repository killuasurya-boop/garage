import ExcelJS from "exceljs";

import { categoryQtyText, type DailyBankReport } from "@/lib/sales-hpp-summary";

// Excel "Laporan Harian Rekening Bersama" (Owner 24 Nov 2026): satu baris per tanggal di sheet Ringkasan (siap disalin
// ke rekap rekening bersama), plus rincian per kategori dan per produk. Nilai uang = angka, bukan teks.
const RP = "#,##0;[Red]-#,##0";
const jakarta = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });

type Column = { header: string; width: number; money?: boolean };

function sheetWithHeader(wb: ExcelJS.Workbook, name: string, stamp: string, columns: Column[]) {
  const sheet = wb.addWorksheet(name);
  sheet.addRow([stamp]).font = { italic: true, color: { argb: "FF555555" } };
  sheet.addRow([]);
  const head = sheet.addRow(columns.map((c) => c.header));
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F1F23" } };
  });
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
    if (c.money) sheet.getColumn(i + 1).numFmt = RP;
  });
  sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];
  return sheet;
}

/** Teks dari data (nama produk/kategori) tidak boleh dibaca Excel sebagai rumus. */
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export async function dailyBankReportWorkbook(reports: DailyBankReport[], meta: { outletName: string; from: string; to: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Garage OS";
  const stamp = `Laporan Harian Rekening Bersama · ${meta.outletName} · ${meta.from} s.d. ${meta.to} · dibuat ${jakarta.format(new Date())} WIB`;
  const methods = [...new Set(reports.flatMap((r) => r.channels.map((c) => c.method)))].sort();

  const summary = sheetWithHeader(wb, "Ringkasan", stamp, [
    { header: "Tanggal", width: 12 },
    { header: "Status", width: 12 },
    { header: "Order", width: 8 },
    { header: "Omzet kotor", width: 15, money: true },
    { header: "Diskon", width: 13, money: true },
    { header: "Refund", width: 13, money: true },
    { header: "Omzet bersih", width: 15, money: true },
    { header: "Cup / porsi terjual", width: 44 },
    { header: "HPP produk", width: 15, money: true },
    { header: "Laba kotor", width: 15, money: true },
    { header: "Upah", width: 13, money: true },
    { header: "Biaya tetap & operasional", width: 16, money: true },
    { header: "Total biaya operasional", width: 16, money: true },
    { header: "Laba operasional", width: 15, money: true },
    { header: "Non-operasional", width: 14, money: true },
    { header: "Pendapatan lain", width: 14, money: true },
    { header: "Laba bersih", width: 15, money: true },
    { header: "Margin bersih %", width: 10 },
    ...methods.map((m) => ({ header: `Masuk ${m}`, width: 14, money: true })),
  ]);
  for (const r of reports) {
    const channel = new Map(r.channels.map((c) => [c.method, c.amount]));
    summary.addRow([
      r.date,
      r.locked ? "Dikunci" : "Sementara",
      r.orderCount,
      r.grossSales,
      r.discount,
      r.refund,
      r.netSales,
      safeText(categoryQtyText(r.sales.categories)),
      r.hppProducts,
      r.grossProfit,
      r.payroll,
      r.operatingExpense,
      r.operatingCost,
      r.operatingProfit,
      r.nonOperatingExpense,
      r.otherIncome,
      r.netProfit,
      r.netMarginPct,
      ...methods.map((m) => channel.get(m) ?? 0),
    ]);
  }
  if (reports.length > 1) {
    const sum = (pick: (r: DailyBankReport) => number) => reports.reduce((total, r) => total + pick(r), 0);
    const total = summary.addRow([
      "TOTAL",
      "",
      sum((r) => r.orderCount),
      sum((r) => r.grossSales),
      sum((r) => r.discount),
      sum((r) => r.refund),
      sum((r) => r.netSales),
      "",
      sum((r) => r.hppProducts),
      sum((r) => r.grossProfit),
      sum((r) => r.payroll),
      sum((r) => r.operatingExpense),
      sum((r) => r.operatingCost),
      sum((r) => r.operatingProfit),
      sum((r) => r.nonOperatingExpense),
      sum((r) => r.otherIncome),
      sum((r) => r.netProfit),
      "",
      ...methods.map((m) => sum((r) => r.channels.find((c) => c.method === m)?.amount ?? 0)),
    ]);
    total.font = { bold: true };
  }

  const categories = sheetWithHeader(wb, "Per kategori", stamp, [
    { header: "Tanggal", width: 12 },
    { header: "Kategori", width: 24 },
    { header: "Qty", width: 8 },
    { header: "Satuan", width: 8 },
    { header: "Omzet item", width: 15, money: true },
    { header: "HPP", width: 15, money: true },
    { header: "Laba kotor", width: 15, money: true },
    { header: "Qty tanpa HPP", width: 12 },
  ]);
  for (const r of reports) {
    for (const c of r.sales.categories) categories.addRow([r.date, safeText(c.name), c.qty, c.unit, c.revenue, c.hpp, c.grossProfit, c.missingHppQty]);
  }

  const products = sheetWithHeader(wb, "Per produk", stamp, [
    { header: "Tanggal", width: 12 },
    { header: "Kategori", width: 20 },
    { header: "Produk", width: 36 },
    { header: "Qty", width: 8 },
    { header: "Satuan", width: 8 },
    { header: "Omzet item", width: 15, money: true },
    { header: "HPP / unit", width: 13, money: true },
    { header: "HPP", width: 15, money: true },
    { header: "Laba kotor", width: 15, money: true },
  ]);
  for (const r of reports) {
    for (const p of r.sales.products) {
      products.addRow([r.date, safeText(p.category), safeText(p.name), p.qty, p.unit, p.revenue, p.unitHpp ?? "belum diisi", p.hpp, p.grossProfit]);
    }
  }

  const notes = wb.addWorksheet("Catatan");
  [
    "HPP produk = HPP per produk (resep / harga modal / harga setor mitra) × qty terjual dari order lunas — bukan belanja gudang.",
    "Upah & biaya operasional = angka Finance (biaya tetap harian + pengeluaran tercatat).",
    "Status Sementara = hari belum di-Daily Closing; angka bisa berubah. Dikunci = angka Daily Closing.",
    "Omzet item = harga item sebelum diskon level order; omzet bersih sudah dikurangi diskon & refund.",
  ].forEach((line) => notes.addRow([line]));
  notes.getColumn(1).width = 120;

  return wb;
}
