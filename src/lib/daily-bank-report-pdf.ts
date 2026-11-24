// PDF "Laporan Harian Rekening Bersama" (Owner 24 Nov 2026): satu halaman per tanggal, urutan sama dengan cara tim
// keuangan mencatat — omzet → HPP produk → laba kotor → biaya operasional → laba bersih → uang masuk per metode.

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "module";

import type { DailyBankReport } from "./sales-hpp-summary";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;
type Doc = PDFKit.PDFDocument;

const M = 48;
const W = 499;
const RED = "#d11a2a";

const fmtRp = (n: number) => `${n < 0 ? "-" : ""}Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(Math.round(n)))}`;
const fmtInt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${key}T00:00:00Z`));

// Logo versi gelap untuk kertas putih. pdfkit standalone tidak membaca path/Buffer Node → data URI (sekali per proses).
let logoData: string | null | undefined;
function loadLogo(): string | null {
  if (logoData !== undefined) return logoData;
  const p = path.join(process.cwd(), "public", "garage-brand", "garage-coffee-logo-dark.png");
  logoData = fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` : null;
  return logoData;
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > 790) doc.addPage();
}

function row(doc: Doc, label: string, value: string, o: { bold?: boolean; color?: string; indent?: number; size?: number; line?: boolean } = {}) {
  ensureSpace(doc, 16);
  if (o.line) {
    doc.strokeColor("#bbb").lineWidth(0.6).moveTo(M, doc.y).lineTo(M + W, doc.y).stroke();
    doc.moveDown(0.25);
  }
  const y = doc.y;
  const size = o.size ?? 10.5;
  doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(o.bold ? "#111" : "#444").text(label, M + (o.indent ?? 0), y, { width: 330 - (o.indent ?? 0) });
  const labelBottom = doc.y;
  doc.font("Helvetica-Bold").fontSize(size).fillColor(o.color ?? "#111").text(value, M + 330, y, { width: W - 330, align: "right" });
  doc.y = Math.max(doc.y, labelBottom);
  doc.moveDown(0.3);
}

function heading(doc: Doc, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(RED).text(title.toUpperCase(), M, doc.y, { width: W, characterSpacing: 0.6 });
  doc.moveDown(0.3);
}

function page(doc: Doc, r: DailyBankReport, outletName: string) {
  const logo = loadLogo();
  if (logo) doc.image(logo, M, 34, { fit: [130, 40] });
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor("#111")
    .text("Laporan Harian Rekening Bersama", M + 150, 36, { width: W - 150, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#444").text(`${outletName} · ${dayLabel(r.date)}`, M + 150, doc.y + 2, { width: W - 150, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(r.locked ? "#15803d" : "#b45309")
    .text(r.locked ? "ANGKA DIKUNCI (DAILY CLOSING)" : "ANGKA SEMENTARA — HARI BELUM DI-CLOSING", M + 150, doc.y + 2, { width: W - 150, align: "right" });
  doc.y = Math.max(doc.y, 84);
  doc.strokeColor(RED).lineWidth(2).moveTo(M, doc.y).lineTo(M + W, doc.y).stroke();
  doc.moveDown(0.6);

  // Kartu ringkas: angka yang paling sering disalin.
  const cards: Array<[string, string, string]> = [
    ["Omzet bersih", fmtRp(r.netSales), "#111"],
    ["HPP produk", fmtRp(r.hppProducts), "#111"],
    ["Laba bersih", fmtRp(r.netProfit), r.netProfit < 0 ? "#b91c1c" : "#15803d"],
  ];
  const cardW = (W - 16) / 3;
  const cardY = doc.y;
  cards.forEach(([label, value, color], i) => {
    const x = M + i * (cardW + 8);
    doc.roundedRect(x, cardY, cardW, 52, 6).lineWidth(0.8).strokeColor("#ddd").stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor("#666").text(label.toUpperCase(), x + 10, cardY + 9, { width: cardW - 20 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(color).text(value, x + 10, cardY + 24, { width: cardW - 20 });
  });
  doc.y = cardY + 62;
  doc.x = M;

  heading(doc, "1. Omzet");
  row(doc, `Omzet kotor (${fmtInt(r.orderCount)} order)`, fmtRp(r.grossSales));
  row(doc, "Diskon", `- ${fmtRp(r.discount)}`, { indent: 12 });
  row(doc, "Refund", `- ${fmtRp(r.refund)}`, { indent: 12 });
  row(doc, "Omzet bersih", fmtRp(r.netSales), { bold: true, line: true });

  heading(doc, "2. Penjualan per kategori");
  if (!r.sales.categories.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666").text("Belum ada penjualan lunas.", M, doc.y);
  } else {
    const cols = [
      { label: "KATEGORI", x: M, w: 170, align: "left" as const },
      { label: "QTY", x: M + 170, w: 70, align: "right" as const },
      { label: "OMZET ITEM", x: M + 240, w: 85, align: "right" as const },
      { label: "HPP", x: M + 325, w: 85, align: "right" as const },
      { label: "LABA KOTOR", x: M + 410, w: 89, align: "right" as const },
    ];
    const line = (values: string[], bold = false, color = "#111") => {
      ensureSpace(doc, 16);
      const y = doc.y;
      let bottom = y;
      values.forEach((value, i) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold && color === "#666" ? 8 : 9.5).fillColor(color).text(value, cols[i].x, y, { width: cols[i].w, align: cols[i].align });
        bottom = Math.max(bottom, doc.y);
      });
      doc.y = bottom;
      doc.moveDown(0.25);
    };
    line(cols.map((c) => c.label), true, "#666");
    for (const cat of r.sales.categories) {
      line([cat.name, `${fmtInt(cat.qty)} ${cat.unit}`, fmtRp(cat.revenue), fmtRp(cat.hpp), fmtRp(cat.grossProfit)]);
    }
    doc.strokeColor("#bbb").lineWidth(0.6).moveTo(M, doc.y).lineTo(M + W, doc.y).stroke();
    doc.moveDown(0.25);
    line(["TOTAL", fmtInt(r.sales.totals.qty), fmtRp(r.sales.totals.revenue), fmtRp(r.sales.totals.hpp), fmtRp(r.sales.totals.grossProfit)], true);
    doc.x = M;
  }

  heading(doc, "3. Laba rugi harian");
  row(doc, "Omzet bersih", fmtRp(r.netSales));
  row(doc, "HPP produk terjual (HPP produk × qty)", `- ${fmtRp(r.hppProducts)}`, { indent: 12 });
  row(doc, "Laba kotor", fmtRp(r.grossProfit), { bold: true, line: true });
  row(doc, "Upah karyawan", `- ${fmtRp(r.payroll)}`, { indent: 12 });
  row(doc, "Biaya tetap & operasional harian", `- ${fmtRp(r.operatingExpense)}`, { indent: 12 });
  row(doc, "Total biaya operasional harian", `- ${fmtRp(r.operatingCost)}`);
  row(doc, "Laba operasional", fmtRp(r.operatingProfit), { bold: true, line: true });
  if (r.nonOperatingExpense) row(doc, "Biaya non-operasional (mis. biaya event)", `- ${fmtRp(r.nonOperatingExpense)}`, { indent: 12 });
  if (r.otherIncome) row(doc, "Pendapatan lain (mis. sponsor)", fmtRp(r.otherIncome), { indent: 12 });
  row(doc, `LABA BERSIH${r.netMarginPct !== null ? ` (margin ${String(r.netMarginPct).replace(".", ",")}%)` : ""}`, fmtRp(r.netProfit), {
    bold: true,
    line: true,
    size: 12,
    color: r.netProfit < 0 ? "#b91c1c" : "#15803d",
  });

  heading(doc, "4. Uang masuk per metode bayar");
  if (!r.channels.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666").text("Tidak ada uang masuk tercatat.", M, doc.y);
  } else {
    for (const channel of r.channels) row(doc, channel.method, fmtRp(channel.amount));
    row(doc, "Total uang masuk", fmtRp(r.channels.reduce((sum, c) => sum + c.amount, 0)), { bold: true, line: true });
  }

  ensureSpace(doc, 60);
  doc.moveDown(0.8);
  const notes = [
    "HPP = HPP per produk (resep / harga modal / harga setor mitra) × qty terjual dari order lunas. Bukan belanja gudang.",
    "Upah & biaya operasional dari Finance (biaya tetap harian + pengeluaran tercatat). Angka sementara bisa berubah sampai hari di-closing.",
  ];
  if (r.sales.totals.missingHppProducts) notes.push(`${r.sales.totals.missingHppProducts} produk terjual belum punya HPP (dihitung Rp0) — lengkapi di menu Produk.`);
  doc.font("Helvetica").fontSize(8).fillColor("#666").text(notes.join("\n"), M, doc.y, { width: W });
}

export async function generateDailyBankReportPdf(reports: DailyBankReport[], outletName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: "Laporan Harian Rekening Bersama", Author: "Garage OS" } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      reports.forEach((report, index) => {
        if (index > 0) doc.addPage();
        page(doc, report, outletName);
      });
      if (!reports.length) doc.font("Helvetica").fontSize(11).text("Tidak ada data.", M, M);
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        // Footer di area margin bawah: matikan margin sementara supaya pdfkit tidak menambah halaman.
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font("Helvetica").fontSize(7.5).fillColor("#888").text(`Garage OS · halaman ${i + 1} dari ${range.count}`, M, 812, { width: W, align: "right", lineBreak: false });
        doc.page.margins.bottom = bottom;
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
