// Excel Keuangan Mitra (Owner/Manajer): angka dari partnerFinanceSummary yang sama dengan layar & PDF.
import ExcelJS from "exceljs";

import { partnerBestSellers, partnerLineFinance } from "@/lib/partner-hub-rules";

type Line = Parameters<typeof partnerBestSellers>[0][number] & {
  orderNo: string;
  createdAt: Date | string;
  tableLabel: string | null;
  customerName: string | null;
  settlementNo?: string | null;
};
export type PartnerFinanceSheetInput = {
  partnerName: string;
  partnerCode: string;
  orderCount: number;
  netSales: number;
  totalCost: number;
  garageProfit: number;
  liabilityTotal: number;
  paidAmount: number;
  outstanding: number;
  lines: Line[];
};

const wib = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
const RP = '#,##0;[Red]-#,##0';

function header(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(2);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
}

export async function partnerFinanceWorkbook(input: { from: string; to: string; generatedBy: string; partners: PartnerFinanceSheetInput[] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Garage OS";
  const stamp = `Garage Coffee · Keuangan Mitra · ${input.from} s.d. ${input.to} · dibuat ${wb.created.toISOString().slice(0, 16).replace("T", " ")} UTC oleh ${input.generatedBy}`;

  const summary = wb.addWorksheet("Ringkasan");
  summary.addRow([stamp]);
  summary.addRow(["Mitra", "Kode", "Order", "Penjualan bersih", "HPP mitra", "Profit Garage", "Kewajiban setoran", "Sudah dibayar", "Sisa"]);
  header(summary);
  for (const p of input.partners) {
    summary.addRow([p.partnerName, p.partnerCode, p.orderCount, p.netSales, p.totalCost, p.garageProfit, p.liabilityTotal, p.paidAmount, p.outstanding]);
  }
  const t = input.partners.reduce(
    (a, p) => ({ o: a.o + p.orderCount, s: a.s + p.netSales, c: a.c + p.totalCost, g: a.g + p.garageProfit, l: a.l + p.liabilityTotal, pd: a.pd + p.paidAmount, out: a.out + p.outstanding }),
    { o: 0, s: 0, c: 0, g: 0, l: 0, pd: 0, out: 0 },
  );
  const total = summary.addRow(["TOTAL", "", t.o, t.s, t.c, t.g, t.l, t.pd, t.out]);
  total.font = { bold: true };
  summary.columns.forEach((col, i) => {
    col.width = i === 0 ? 34 : 16;
    if (i >= 3) col.numFmt = RP;
  });

  const best = wb.addWorksheet("Produk terlaris");
  best.addRow([stamp]);
  best.addRow(["Mitra", "Produk", "Varian", "Qty terjual", "Penjualan", "HPP", "Profit Garage"]);
  header(best);
  for (const p of input.partners) {
    for (const row of partnerBestSellers(p.lines)) best.addRow([p.partnerName, row.itemName, row.variantLabel, row.qty, row.gross, row.cost, row.profit]);
  }
  best.columns.forEach((col, i) => {
    col.width = i <= 1 ? 30 : 14;
    if (i >= 4) col.numFmt = RP;
  });

  const detail = wb.addWorksheet("Transaksi");
  detail.addRow([stamp]);
  detail.addRow(["Waktu (WIB)", "Mitra", "No. Order", "Meja", "Pemesan", "Produk", "Varian", "Qty", "Harga", "Total jual", "HPP", "Profit", "Setoran", "Status", "Settlement"]);
  header(detail);
  for (const p of input.partners) {
    for (const line of p.lines) {
      const f = partnerLineFinance(line);
      detail.addRow([
        wib.format(new Date(line.createdAt)),
        p.partnerName,
        line.orderNo,
        line.tableLabel ?? "Take away",
        line.customerName ?? "-",
        line.itemName,
        line.variantLabel,
        line.qty,
        line.unitPrice,
        f.gross,
        f.cost,
        f.profit,
        f.liability,
        line.status,
        line.settlementNo ?? "",
      ]);
    }
  }
  detail.columns.forEach((col, i) => {
    col.width = [17, 26, 18, 10, 18, 26, 12, 6, 12, 13, 12, 12, 12, 12, 26][i] ?? 12;
    if (i >= 8 && i <= 12) col.numFmt = RP;
  });
  for (const sheet of [summary, best, detail]) sheet.views = [{ state: "frozen", ySplit: 2 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
