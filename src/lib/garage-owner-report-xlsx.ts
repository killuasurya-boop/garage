import ExcelJS from "exceljs";

import type { OwnerReportData } from "@/lib/garage-owner-report";

// Laporan Owner Gabungan — workbook Excel multi-sheet.
// Mengikuti pola src/app/api/finance/export/route.ts.

export async function generateOwnerReportXlsx(
  data: OwnerReportData,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Garage OS";
  wb.created = new Date(data.generatedAt);

  // ── Ringkasan ──
  const sum = wb.addWorksheet("Ringkasan");
  sum.addRow(["Laporan Owner Harian — Garage Coffee & Motor"]);
  sum.addRow(["Tanggal", data.dateText]);
  sum.addRow(["Dibuat", new Date(data.generatedAt).toLocaleString("id-ID")]);
  sum.addRow([]);
  sum.addRow(["Headline", data.headline]);
  sum.addRow([]);
  sum.addRow(["PROFIT & LOSS"]);
  sum.addRow(["Revenue (order lunas)", data.pnl.revenue]);
  sum.addRow(["Jumlah order", data.pnl.orderCount]);
  sum.addRow(["Rata-rata / order", data.pnl.avgOrderValue]);
  sum.addRow(["Pengeluaran", data.pnl.expenses]);
  sum.addRow(["Net harian", data.pnl.net]);
  sum.addRow([]);
  sum.addRow(["KEHADIRAN STAF"]);
  sum.addRow(["Hadir", data.attendance.present]);
  sum.addRow(["Total staf aktif", data.attendance.totalStaff]);
  sum.addRow(["Telat", data.attendance.lateIn]);
  sum.addRow(["Belum punch", data.attendance.absent]);
  sum.addRow([]);
  sum.addRow(["DAPUR"]);
  sum.addRow(["Tiket aktif", data.kitchen.activeTickets]);
  sum.addRow(["Tiket telat", data.kitchen.lateTickets]);
  if (data.financeGuard) {
    sum.addRow([]);
    sum.addRow(["FINANCE GUARD"]);
    sum.addRow(["Level", data.financeGuard.level ?? "-"]);
    sum.addRow(["Health score", data.financeGuard.healthScore ?? "-"]);
    sum.addRow(["Brief", data.financeGuard.brief ?? "-"]);
  }
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.getColumn(1).width = 28;
  sum.getColumn(2).width = 48;

  // ── Top Item ──
  const top = wb.addWorksheet("Top Item");
  top.addRow(["Item", "Varian", "Qty", "Omzet"]);
  top.getRow(1).font = { bold: true };
  for (const it of data.topItems) {
    top.addRow([it.itemName, it.variantLabel, it.qty, it.revenue]);
  }
  top.getColumn(1).width = 32;
  top.getColumn(2).width = 18;
  top.getColumn(3).width = 10;
  top.getColumn(4).width = 16;

  // ── Stok Rendah ──
  const low = wb.addWorksheet("Stok Rendah");
  low.addRow(["SKU", "Nama", "On hand", "Min", "Unit"]);
  low.getRow(1).font = { bold: true };
  for (const it of data.lowStock) {
    low.addRow([it.sku, it.name, it.onHand, it.min, it.unit]);
  }
  low.getColumn(1).width = 16;
  low.getColumn(2).width = 32;
  low.getColumn(3).width = 12;
  low.getColumn(4).width = 12;
  low.getColumn(5).width = 10;

  // ── Tiket Telat ──
  const late = wb.addWorksheet("Tiket Telat");
  late.addRow(["Tiket", "Station", "Meja", "Status", "Elapsed (mnt)", "Lewat (mnt)"]);
  late.getRow(1).font = { bold: true };
  for (const t of data.kitchen.lateList) {
    late.addRow([t.ticketNo, t.station, t.tableLabel, t.status, t.elapsed, t.overBy]);
  }
  late.columns.forEach((c) => {
    c.width = 16;
  });

  // ── Action Prioritas ──
  const act = wb.addWorksheet("Action Prioritas");
  act.addRow(["Severity", "Action"]);
  act.getRow(1).font = { bold: true };
  for (const a of data.recommendedActions) {
    act.addRow([a.severity, a.label]);
  }
  act.getColumn(1).width = 12;
  act.getColumn(2).width = 64;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
