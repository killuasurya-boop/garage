// =============================================================================
// Engine laporan standar Garage OS (Okt 2026). Satu model laporan → PDF, XLSX,
// CSV dengan format yang sama untuk semua modul: kop Garage Coffee,
// judul, divisi, periode, outlet, ringkasan, tabel dengan subtotal/total,
// Rupiah (IDR), tanggal WIB, header/footer & nomor halaman.
// Isi tiap laporan dibangun per modul (src/lib/reports/*), bukan tabel generik.
// =============================================================================
import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import { reportFileName } from "@/lib/report-file-name";

/** money = Rupiah bulat; price = harga satuan (boleh pecahan, mis. Rp0,12/gr). */
export type ReportColumnType = "text" | "date" | "int" | "qty" | "money" | "price" | "pct";
export type ReportColumn = {
  key: string;
  label: string;
  type: ReportColumnType;
  /** Bobot lebar relatif (default: teks 1.3, angka 1). */
  weight?: number;
  /** Jangan dijumlah di SUBTOTAL/TOTAL (mis. qty beda satuan). */
  noSum?: boolean;
};
export type ReportRow = Record<string, string | number | null>;
export type ReportTable = {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Baris TOTAL (dicetak tebal di akhir tabel). */
  totals?: ReportRow;
  /** Kolom pengelompok: baris SUBTOTAL disisipkan tiap ganti nilai kolom ini. */
  subtotalBy?: string;
  /** PDF: maks. baris teks per sel (default 2). Naikkan agar isi panjang tidak terpotong. */
  maxLines?: number;
};

export type ReportDoc = {
  title: string;
  /** Mis. "Divisi Bar" — tampil di kop & nama file. */
  division?: string | null;
  periodLabel: string;
  outletName?: string | null;
  generatedAt: string;
  summary: Array<{ label: string; value: string }>;
  tables: ReportTable[];
  notes: string[];
  /** Filter yang dipakai (tampil di kop PDF & sheet Ringkasan XLSX). */
  filters?: string[];
  /** Nama pembuat laporan. */
  generatedBy?: string | null;
  /** PDF: tampilkan logo Garage Coffee di kop (bila file logo tersedia). */
  showLogo?: boolean;
  /** Paksa orientasi PDF; default otomatis (landscape bila tabel > 6 kolom). */
  orientation?: "portrait" | "landscape";
};

export const EXPORT_FORMATS = ["pdf", "xlsx", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const CONTENT_TYPE: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

// ─── Format angka & tanggal ──────────────────────────────────────────────────

export function formatRupiah(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}Rp${new Intl.NumberFormat("id-ID").format(Math.abs(rounded))}`;
}

/** Harga satuan: Rupiah dengan maksimal 2 desimal (unit cost per ml/gr). */
export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const text = new Intl.NumberFormat("id-ID", { maximumFractionDigits: abs >= 100 ? 0 : 2 }).format(abs);
  return `${value < 0 ? "-" : ""}Rp${text}`;
}

export function formatQty(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

/** "2026-10-13" → "13 Okt 2026" (tanggal kalender, tanpa pergeseran zona waktu). */
export function formatDateKey(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!match) return key;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Label periode laporan dari dua tanggal kalender WIB. */
export function periodLabelFor(from: string, to: string) {
  return from === to ? formatDateKey(from) : `${formatDateKey(from)} – ${formatDateKey(to)}`;
}

function cellText(value: string | number | null | undefined, type: ReportColumnType) {
  if (value === null || value === undefined || value === "") return type === "text" || type === "date" ? "" : "—";
  if (type === "money") return formatRupiah(Number(value));
  if (type === "price") return formatPrice(Number(value));
  if (type === "pct") return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Number(value))}%`;
  if (type === "int") return new Intl.NumberFormat("id-ID").format(Number(value));
  if (type === "qty") return formatQty(Number(value));
  if (type === "date") return formatDateKey(String(value));
  return String(value);
}

const NUMERIC: ReportColumnType[] = ["int", "qty", "money", "price", "pct"];

/** Jumlahkan kolom angka (bukan pct) untuk baris TOTAL. */
export function sumRows(rows: ReportRow[], columns: ReportColumn[], label: { key: string; text: string }): ReportRow {
  const total: ReportRow = { [label.key]: label.text };
  for (const column of columns) {
    if (column.key === label.key || column.noSum || !["int", "qty", "money"].includes(column.type)) continue;
    total[column.key] = Number(rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0).toFixed(4));
  }
  return total;
}

/** Baris tabel dengan SUBTOTAL per kelompok (dipakai PDF & XLSX). */
function expandRows(table: ReportTable) {
  const out: Array<{ row: ReportRow; kind: "row" | "subtotal" | "total" }> = [];
  if (!table.subtotalBy) {
    for (const row of table.rows) out.push({ row, kind: "row" });
  } else {
    const groups = new Map<string, ReportRow[]>();
    for (const row of table.rows) {
      const key = String(row[table.subtotalBy] ?? "-");
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const labelKey = table.columns.find((c) => c.type === "text" && c.key !== table.subtotalBy)?.key ?? table.columns[0].key;
    for (const [key, rows] of groups) {
      for (const row of rows) out.push({ row, kind: "row" });
      if (groups.size > 1) {
        const sub = sumRows(rows, table.columns, { key: labelKey, text: `Subtotal ${key}` });
        out.push({ row: sub, kind: "subtotal" });
      }
    }
  }
  if (table.totals && table.rows.length) out.push({ row: table.totals, kind: "total" });
  return out;
}

// ─── Nama file standar (modul ringan, juga dipakai UI) ─────────────────────
export { reportFileName } from "@/lib/report-file-name";

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function reportToCsv(report: ReportDoc) {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [
    escape("GARAGE COFFEE"),
    escape(report.title + (report.division ? ` — ${report.division}` : "")),
    escape(`Periode: ${report.periodLabel}`),
  ];
  if (report.outletName) lines.push(escape(`Outlet: ${report.outletName}`));
  lines.push(escape(`Dibuat: ${generatedLabel(report.generatedAt)}`), "");
  for (const item of report.summary) lines.push([escape(item.label), escape(item.value)].join(","));
  for (const table of report.tables) {
    lines.push("", escape(table.title), table.columns.map((c) => escape(c.label)).join(","));
    for (const { row } of expandRows(table)) {
      // Angka mentah (tanpa "Rp"/titik ribuan) supaya bisa diolah di spreadsheet.
      lines.push(table.columns.map((c) => escape(row[c.key] ?? "")).join(","));
    }
  }
  return `﻿${lines.join("\r\n")}`;
}

// ─── XLSX ────────────────────────────────────────────────────────────────────

export async function reportToXlsx(report: ReportDoc) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Garage OS";
  workbook.company = "Garage Coffee";
  workbook.created = new Date(report.generatedAt);
  const titleLine = report.title + (report.division ? ` — ${report.division}` : "");
  const metaLine = [`Periode: ${report.periodLabel}`, report.outletName ? `Outlet: ${report.outletName}` : null, `Dibuat: ${generatedLabel(report.generatedAt)}`]
    .filter(Boolean)
    .join("   ·   ");

  const summarySheet = workbook.addWorksheet("Ringkasan");
  summarySheet.addRow(["GARAGE COFFEE"]).font = { bold: true, size: 14, color: { argb: "FFC41A1A" } };
  summarySheet.addRow([titleLine]).font = { bold: true, size: 12 };
  summarySheet.addRow([metaLine]).font = { color: { argb: "FF6B7280" } };
  if (report.generatedBy) summarySheet.addRow([`Dibuat oleh: ${report.generatedBy}`]).font = { color: { argb: "FF6B7280" } };
  if (report.filters?.length) summarySheet.addRow([`Filter: ${report.filters.join(" · ")}`]).font = { color: { argb: "FF6B7280" } };
  summarySheet.addRow([]);
  for (const item of report.summary) {
    const row = summarySheet.addRow([item.label, item.value]);
    row.getCell(1).font = { color: { argb: "FF374151" } };
    row.getCell(2).font = { bold: true };
  }
  if (report.notes.length) summarySheet.addRow([]);
  for (const note of report.notes) summarySheet.addRow([note]).font = { italic: true, color: { argb: "FF6B7280" } };
  summarySheet.getColumn(1).width = 40;
  summarySheet.getColumn(2).width = 30;
  setupPrint(summarySheet, titleLine, false);

  const used = new Set<string>(["Ringkasan"]);
  for (const table of report.tables) {
    let name = table.title.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Data";
    for (let i = 2; used.has(name); i += 1) name = `${name.slice(0, 28)} ${i}`;
    used.add(name);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([titleLine]).font = { bold: true, size: 12 };
    sheet.addRow([`${table.title}   ·   ${metaLine}`]).font = { color: { argb: "FF6B7280" } };
    sheet.addRow([]);
    const header = sheet.addRow(table.columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1D26" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    const headerRow = header.number;
    for (const { row, kind } of expandRows(table)) {
      const added = sheet.addRow(
        table.columns.map((c) => {
          const value = row[c.key];
          if (value === null || value === undefined || value === "") return null;
          if (c.type === "pct") return Number(value) / 100;
          if (NUMERIC.includes(c.type)) return Number(value);
          return value;
        }),
      );
      if (kind !== "row") {
        added.font = { bold: true };
        added.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kind === "total" ? "FFFDE7C8" : "FFF4F4F5" } };
        });
      }
    }
    table.columns.forEach((column, index) => {
      const col = sheet.getColumn(index + 1);
      const longest = Math.max(
        column.label.length,
        ...table.rows.slice(0, 500).map((row) => cellText(row[column.key], column.type).length),
      );
      col.width = Math.min(48, Math.max(column.type === "text" ? 14 : 12, longest + 2));
      if (column.type === "money") col.numFmt = '"Rp"#,##0;[Red]-"Rp"#,##0';
      if (column.type === "price") col.numFmt = '"Rp"#,##0.##';
      if (column.type === "pct") col.numFmt = "0.0%";
      if (column.type === "int") col.numFmt = "#,##0";
      if (column.type === "qty") col.numFmt = "#,##0.##";
      if (NUMERIC.includes(column.type)) col.alignment = { horizontal: "right" };
    });
    if (table.rows.length) {
      sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } };
    }
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
    setupPrint(sheet, titleLine, table.columns.length > 6);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function setupPrint(sheet: ExcelJS.Worksheet, title: string, landscape: boolean) {
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  sheet.headerFooter = {
    oddHeader: `&L&"-,Bold"GARAGE COFFEE&R${title.replace(/&/g, "&&")}`,
    oddFooter: "&LGarage OS&RHalaman &P dari &N",
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

function generatedLabel(iso: string) {
  return `${new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`;
}

export function reportToPdf(report: ReportDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const wide = report.orientation ? report.orientation === "landscape" : report.tables.some((t) => t.columns.length > 6);
    const doc = new PDFDocument({ size: "A4", layout: wide ? "landscape" : "portrait", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const DARK = "#1a1111";
    const RED = "#c41a1a";
    const AMBER = "#b45309";
    const MUTED = "#6b7280";
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 24;
    const titleLine = report.title.toUpperCase();

    // Kop halaman pertama
    doc.rect(left, 36, width, 66).fill(DARK);
    doc.rect(left, 98, width, 4).fill(RED);
    const logo = report.showLogo ? readLogo() : null;
    if (logo) {
      doc.image(logo, left + 12, 44, { fit: [150, 30] });
    } else {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff").text("GARAGE COFFEE", left + 14, 48);
    }
    doc.font("Helvetica").fontSize(8.5).fillColor("#d4d4d8").text(report.outletName ? `Outlet ${report.outletName}` : "Garage OS", left + 14, 70);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#f2b872").text(titleLine, left, 46, { width: width - 14, align: "right" });
    if (report.division) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(report.division.toUpperCase(), left, 62, { width: width - 14, align: "right" });
    }
    doc.font("Helvetica").fontSize(9).fillColor("#ffffff").text(`Periode: ${report.periodLabel}`, left, report.division ? 76 : 66, { width: width - 14, align: "right" });
    doc.y = 116;
    const metaParts = [
      report.generatedBy ? `Dibuat oleh: ${report.generatedBy}` : null,
      `Tanggal pembuatan: ${generatedLabel(report.generatedAt)}`,
    ].filter(Boolean);
    if (report.generatedBy || report.filters?.length) {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(metaParts.join("   ·   "), left, doc.y, { width });
      if (report.filters?.length) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Filter: ${report.filters.join(" · ")}`, left, doc.y + 2, { width });
      }
      doc.y += 8;
    }

    // Ringkasan
    if (report.summary.length) {
      const cols = wide ? 4 : 3;
      const boxW = (width - (cols - 1) * 8) / cols;
      report.summary.forEach((item, index) => {
        const col = index % cols;
        if (col === 0 && index > 0) doc.y += 44;
        const x = left + col * (boxW + 8);
        const y = doc.y;
        doc.roundedRect(x, y, boxW, 38, 4).fill("#f4f4f5");
        doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(item.label.toUpperCase(), x + 8, y + 6, { width: boxW - 16, lineBreak: false, ellipsis: true });
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(DARK).text(item.value, x + 8, y + 19, { width: boxW - 16, lineBreak: false, ellipsis: true });
        doc.y = y;
      });
      doc.y += 56;
    }

    for (const table of report.tables) {
      if (doc.y > bottom() - 60) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(table.title, left, doc.y);
      doc.moveDown(0.3);
      const weights = table.columns.map((c) => c.weight ?? (c.type === "text" ? 1.4 : c.type === "date" ? 1 : 1));
      const sum = weights.reduce((a, b) => a + b, 0);
      const widths = weights.map((w) => (w / sum) * width);
      const align = (c: ReportColumn) => (NUMERIC.includes(c.type) ? "right" : "left");
      // Tinggi header & baris mengikuti teks terpanjang (maks. 2 baris) supaya
      // label/isi tidak terpotong atau saling tumpuk.
      const LINE = 9;
      const maxLines = Math.max(2, table.maxLines ?? 2);
      const linesFor = (text: string, colWidth: number, bold: boolean, cap = 2) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
        return Math.min(cap, Math.max(1, Math.ceil(doc.heightOfString(text || " ", { width: colWidth - 8 }) / LINE - 0.01)));
      };
      const headerLines = Math.max(...table.columns.map((c, i) => linesFor(c.label, widths[i], true)));
      const headerH = 11 + headerLines * LINE;
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(left, y, width, headerH).fill(DARK);
        let x = left;
        table.columns.forEach((c, i) => {
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff").text(c.label, x + 4, y + 5.5, {
            width: widths[i] - 8,
            height: headerLines * LINE + 3,
            align: align(c),
            lineGap: 0.5,
            ellipsis: true,
          });
          x += widths[i];
        });
        doc.y = y + headerH;
      };
      drawHeader();
      const rows = expandRows(table);
      if (!table.rows.length) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Tidak ada data pada periode ini.", left + 4, doc.y + 4);
        doc.y += 18;
      }
      rows.forEach(({ row, kind }, index) => {
        const texts = table.columns.map((c) => {
          const value = row[c.key];
          // Baris SUBTOTAL/TOTAL: kolom yang tidak dijumlah dibiarkan kosong.
          if (kind !== "row" && (value === null || value === undefined)) return "";
          return cellText(value, c.type);
        });
        const lines = Math.max(...table.columns.map((c, i) => (NUMERIC.includes(c.type) ? 1 : linesFor(texts[i], widths[i], kind !== "row", maxLines))));
        const rowH = 7 + lines * LINE;
        if (doc.y + rowH > bottom()) {
          doc.addPage();
          doc.y = doc.page.margins.top + 14;
          drawHeader();
        }
        const y = doc.y;
        if (kind === "total") doc.rect(left, y, width, rowH).fill("#fde7c8");
        else if (kind === "subtotal") doc.rect(left, y, width, rowH).fill("#ececef");
        else if (index % 2 === 1) doc.rect(left, y, width, rowH).fill("#fafafa");
        let x = left;
        table.columns.forEach((c, i) => {
          const value = row[c.key];
          const negative = (c.type === "money" || c.type === "price" || c.type === "pct" || c.type === "qty") && Number(value) < 0;
          doc
            .font(kind === "row" ? "Helvetica" : "Helvetica-Bold")
            .fontSize(7.5)
            .fillColor(negative ? RED : DARK)
            .text(texts[i], x + 4, y + 4, {
              width: widths[i] - 8,
              height: lines * LINE + 3,
              align: align(c),
              lineGap: 0.5,
              ellipsis: true,
            });
          x += widths[i];
        });
        doc.y = y + rowH;
      });
      doc.y += 14;
    }

    if (report.notes.length) {
      if (doc.y > bottom() - 40) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(AMBER).text("Catatan", left, doc.y);
      for (const note of report.notes) doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`• ${note}`, left, doc.y + 2, { width });
    }

    // Header (halaman ≥ 2) & footer + nomor halaman di semua halaman.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const pageNo = i - range.start + 1;
      // Footer ditulis di area margin bawah: matikan margin sementara supaya
      // PDFKit tidak menganggapnya "keluar halaman" lalu menambah halaman kosong.
      const marginBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const footerY = doc.page.height - marginBottom - 8;
      if (pageNo > 1) {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text("GARAGE COFFEE", left, 18, { width: width / 2, lineBreak: false });
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(MUTED)
          .text(`${report.title}${report.division ? ` · ${report.division}` : ""} · ${report.periodLabel}`, left + width / 2, 18, {
            width: width / 2,
            align: "right",
            lineBreak: false,
            ellipsis: true,
          });
      }
      doc.moveTo(left, footerY - 4).lineTo(left + width, footerY - 4).lineWidth(0.5).strokeColor("#d4d4d8").stroke();
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          `Dokumen internal Garage Coffee · Dibuat ${generatedLabel(report.generatedAt)}${report.generatedBy ? ` oleh ${report.generatedBy}` : ""} · Garage OS`,
          left,
          footerY,
          { width: (width * 2) / 3, lineBreak: false, ellipsis: true },
        );
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(MUTED)
        .text(`Halaman ${pageNo} dari ${range.count}`, left + (width * 2) / 3, footerY, { width: width / 3, align: "right", lineBreak: false });
      doc.page.margins.bottom = marginBottom;
    }
    doc.end();
  });
}

let logoCache: string | null | undefined;
/**
 * Logo Garage Coffee (transparan, untuk kop gelap) sebagai data URI — build
 * standalone PDFKit tidak mengenali Buffer Node. null bila file tidak ada.
 */
function readLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "public", "garage-brand", "garage-coffee-logo.png"));
    logoCache = `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Render laporan ke format yang diminta + nama file standar. */
export async function renderReport(
  report: ReportDoc,
  format: ExportFormat,
  naming: { kind: string; division?: string | null; from: string; to: string },
) {
  const filename = reportFileName({ ...naming, ext: format });
  const body =
    format === "csv"
      ? Buffer.from(reportToCsv(report), "utf8")
      : format === "xlsx"
        ? await reportToXlsx(report)
        : await reportToPdf(report);
  return { body, filename, contentType: CONTENT_TYPE[format] };
}

/** Response unduhan standar (Content-Disposition + nama file aman). */
export function reportDownloadResponse(file: { body: Buffer; filename: string; contentType: string }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
