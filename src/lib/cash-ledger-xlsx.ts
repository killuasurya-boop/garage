import ExcelJS from "exceljs";

import type { CashLedgerReport } from "@/lib/cash-ledger-report";

// F38 (PRD §20.2): Excel buku kas — setiap baris ber-ID stabil (id buku kas + seq).
const jakarta = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
const RP = "#,##0;[Red]-#,##0";

type Column = { header: string; width: number; money?: boolean };

function header(sheet: ExcelJS.Worksheet, stamp: string, columns: Column[]) {
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
  sheet.views = [{ state: "frozen", ySplit: 3 }];
}

export async function cashLedgerWorkbook(r: CashLedgerReport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Garage OS";
  const stamp = `${r.meta.reportId} · periode ${r.from} s.d. ${r.to} · dibuat ${jakarta.format(new Date(r.meta.generatedAt))} WIB · hash ${r.meta.hash.slice(0, 16)}`;

  const summary = wb.addWorksheet("Ringkasan");
  header(summary, stamp, [
    { header: "Akun", width: 44 },
    { header: "Saldo awal", width: 16, money: true },
    { header: "Masuk", width: 16, money: true },
    { header: "Keluar", width: 16, money: true },
    { header: "Saldo akhir", width: 16, money: true },
    { header: "Cek DB", width: 12 },
  ]);
  for (const a of r.accounts) summary.addRow([a.label, a.opening, a.inflow, a.outflow, a.closing, a.reconciled ? "Cocok" : "BEDA"]);
  summary.addRow([]);
  summary.addRow(["Pihak luar (non-laci) — masuk", null, r.external.inflow]);
  summary.addRow(["Pihak luar (non-laci) — keluar", null, null, r.external.outflow]);

  const bySource = wb.addWorksheet("Arus per jenis");
  header(bySource, stamp, [
    { header: "Akun", width: 30 },
    { header: "Jenis", width: 36 },
    { header: "Baris", width: 8 },
    { header: "Masuk", width: 16, money: true },
    { header: "Keluar", width: 16, money: true },
  ]);
  for (const a of r.accounts) for (const s of a.bySource) bySource.addRow([a.label, s.label, s.count, s.inflow, s.outflow]);

  const moves = wb.addWorksheet("Pergerakan dana");
  header(moves, stamp, [
    { header: "ID buku kas", width: 38 },
    { header: "Seq", width: 8 },
    { header: "Waktu (WIB)", width: 20 },
    { header: "Tanggal operasional", width: 14 },
    { header: "Outlet", width: 10 },
    { header: "Dari akun", width: 16 },
    { header: "Ke akun", width: 16 },
    { header: "Nominal", width: 14, money: true },
    { header: "Jenis", width: 28 },
    { header: "Ref sumber", width: 22 },
    { header: "Shift", width: 22 },
    { header: "Oleh", width: 18 },
    { header: "Penyetuju", width: 18 },
    { header: "Membalik ID", width: 38 },
    { header: "Dibalik oleh ID", width: 38 },
    { header: "Data lama", width: 10 },
    { header: "Catatan", width: 36 },
  ]);
  for (const e of r.entries) {
    moves.addRow([
      e.id,
      e.seq,
      jakarta.format(new Date(e.at)),
      e.businessDate,
      e.outletCode ?? "",
      e.fromAccount,
      e.toAccount,
      e.amount,
      e.label,
      e.sourceRef ?? "",
      e.sessionCode ?? "",
      e.actorName ?? "",
      e.approverName ?? "",
      e.reversesId ?? "",
      e.reversedById ?? "",
      e.legacy ? "ya" : "",
      e.note ?? "",
    ]);
  }

  for (const a of r.accounts) {
    if (!a.lines.length) continue;
    const sheet = wb.addWorksheet(a.label.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
    header(sheet, `${stamp} · saldo awal ${a.opening}`, [
      { header: "ID buku kas", width: 38 },
      { header: "Seq", width: 8 },
      { header: "Waktu (WIB)", width: 20 },
      { header: "Jenis", width: 28 },
      { header: "Lawan akun", width: 16 },
      { header: "Masuk", width: 14, money: true },
      { header: "Keluar", width: 14, money: true },
      { header: "Saldo", width: 14, money: true },
      { header: "Ref", width: 22 },
      { header: "Shift", width: 22 },
      { header: "Oleh", width: 18 },
    ]);
    for (const l of a.lines) {
      sheet.addRow([l.id, l.seq, jakarta.format(new Date(l.at)), l.label, l.counterparty, l.inflow || null, l.outflow || null, l.running, l.ref ?? "", l.sessionCode ?? "", l.by ?? ""]);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
