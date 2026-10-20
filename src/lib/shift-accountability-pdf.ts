// =============================================================================
// PDF Laporan Lengkap Aktivitas Kasir & Pertanggungjawaban Kas (owner, Okt 2026)
// A4, ringkasan portrait + tabel lebar landscape, header/footer + nomor halaman
// di setiap halaman, tabel otomatis lanjut ke halaman berikut (header diulang).
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { denominationRows } from "@/lib/cash-denominations";
import { INCIDENT_STATUS_LABEL, PETTY_CASH_STATUS_LABEL, type IncidentStatus } from "@/lib/cashier-accountability";
import { SHIFT_REPORT_DEFINITIONS, type ShiftAccountability } from "@/lib/shift-accountability-report";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

const INK = "#111111";
const MUTED = "#55555c";
const LINE = "#d4d4d8";
const RED = "#c8102e";
const AMBER = "#b45309";
const ZEBRA = "#f4f4f5";
const MARGIN = 36;

const rp = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : `${value < 0 ? "-" : ""}Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(Math.round(value)))}`;
const num = (value: number) => new Intl.NumberFormat("id-ID").format(value);
const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : "-";
const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "-";
const longDate = (key: string) =>
  new Date(`${key}T12:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const duration = (minutes: number) => `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
/** Font standar PDF (WinAnsi) tidak punya −, Σ, ±, → — ganti ke ASCII agar tidak jadi simbol acak. */
export function pdfSafe(value: string) {
  return value
    .replace(/\u2212/g, "-")
    .replace(/\u03a3\s?/g, "Jumlah ")
    .replace(/\u00b1/g, "+/-")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2264]/g, "<=")
    .replace(/[\u2265]/g, ">=");
}
const text = (value: unknown) => (value === null || value === undefined || value === "" ? "-" : String(value));

export type AccountabilityPdfKind = "shift" | "cashier" | "all" | "cash" | "combined";

export const ACCOUNTABILITY_KIND_TITLE: Record<AccountabilityPdfKind, string> = {
  shift: "Laporan Pertanggungjawaban Shift Kasir",
  cashier: "Laporan Aktivitas Kasir Harian",
  all: "Laporan Seluruh Kasir Harian",
  cash: "Laporan Kas & Petty Cash",
  combined: "Laporan Operasional Kasir Harian",
};

/** Nama file sesuai tanggal OPERASIONAL (bukan tanggal unduh), tanpa karakter khusus. */
export function accountabilityFileName(params: { kind: AccountabilityPdfKind; date: string; cashierName?: string | null; shiftNumber?: number | null }) {
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "")
      .slice(0, 40) || "Kasir";
  const name = clean(params.cashierName ?? "Kasir");
  switch (params.kind) {
    case "shift":
      return `Laporan_Shift_${name}_${params.date}_Shift-${params.shiftNumber ?? 1}.pdf`;
    case "cashier":
      return `Laporan_Kasir_${name}_${params.date}.pdf`;
    case "all":
      return `Laporan_Kasir_Garage_${params.date}.pdf`;
    case "cash":
      return `Laporan_Kas_PettyCash_${params.date}.pdf`;
    default:
      return `Laporan_Operasional_Kasir_Garage_${params.date}.pdf`;
  }
}

type PettyDay = {
  openingBalance: number;
  topups: number;
  expenses: number;
  adjustments: number;
  closingBalance: number;
  pendingCount: number;
  pendingExpenseTotal: number;
  rejectedCount: number;
  ledger: Array<ShiftAccountability["petty"][number] & { runningBalance: number | null }>;
};

type Column = { label: string; width: number; align?: "left" | "right" | "center" };

function loadLogo() {
  for (const candidate of [
    path.join(process.cwd(), "public/garage-brand/garage-coffee-logo-dark.png"),
    path.join(process.cwd(), "../public/garage-brand/garage-coffee-logo-dark.png"),
  ]) {
    try {
      // pdfkit standalone tidak menerima Buffer Node → kirim sebagai data URI.
      if (existsSync(candidate)) return `data:image/png;base64,${readFileSync(candidate).toString("base64")}`;
    } catch {
      // logo opsional
    }
  }
  return null;
}

class Writer {
  doc: PDFKit.PDFDocument;
  header: string;
  constructor(header: string) {
    this.header = header;
    this.doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, autoFirstPage: false });
    // Semua teks lewat pdfSafe (termasuk ukuran baris) supaya simbol aman.
    const doc = this.doc as unknown as {
      text: (value: unknown, ...rest: unknown[]) => unknown;
      heightOfString: (value: unknown, ...rest: unknown[]) => number;
    };
    const originalText = doc.text.bind(doc);
    const originalHeight = doc.heightOfString.bind(doc);
    doc.text = (value: unknown, ...rest: unknown[]) => originalText(typeof value === "string" ? pdfSafe(value) : value, ...rest);
    doc.heightOfString = (value: unknown, ...rest: unknown[]) =>
      originalHeight(typeof value === "string" ? pdfSafe(value) : value, ...rest);
  }
  get left() {
    return this.doc.page.margins.left;
  }
  get width() {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }
  get bottom() {
    return this.doc.page.height - this.doc.page.margins.bottom - 14;
  }
  page(layout: "portrait" | "landscape" = "portrait") {
    this.doc.addPage({ size: "A4", layout, margins: { top: MARGIN + 16, bottom: MARGIN, left: MARGIN, right: MARGIN } });
  }
  ensure(height: number, layout: "portrait" | "landscape" = this.doc.page.layout as "portrait" | "landscape") {
    if (this.doc.y + height > this.bottom) this.page(layout);
  }
  /** Bagian baru; ganti halaman bila orientasi berbeda atau ruang tinggal sedikit. */
  section(title: string, layout: "portrait" | "landscape" = "portrait", note?: string) {
    if ((this.doc.page.layout ?? "portrait") !== layout || this.doc.y > this.bottom - 120) this.page(layout);
    else this.doc.moveDown(0.6);
    const { doc } = this;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(title, this.left, doc.y);
    doc.moveTo(this.left, doc.y + 2).lineTo(this.left + this.width, doc.y + 2).lineWidth(1.2).strokeColor(RED).stroke();
    doc.moveDown(0.5);
    if (note) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(note, this.left, doc.y, { width: this.width });
    doc.moveDown(0.3);
  }
  paragraph(value: string, opts: { color?: string; size?: number; bold?: boolean } = {}) {
    this.ensure(14);
    this.doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size ?? 8.5)
      .fillColor(opts.color ?? INK)
      .text(value, this.left, this.doc.y, { width: this.width });
  }
  /** Kartu ringkas 2–4 kolom: [label, nilai]. */
  cards(items: Array<[string, string, string?]>, perRow = 4) {
    const { doc } = this;
    const gap = 6;
    const cardW = (this.width - gap * (perRow - 1)) / perRow;
    const cardH = 38;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(cardH + gap);
      const y = doc.y;
      items.slice(i, i + perRow).forEach(([label, value, tone], index) => {
        const x = this.left + index * (cardW + gap);
        doc.roundedRect(x, y, cardW, cardH, 3).lineWidth(0.6).strokeColor(LINE).stroke();
        doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x + 6, y + 5, { width: cardW - 12, lineBreak: false, ellipsis: true });
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(tone === "bad" ? RED : tone === "warn" ? AMBER : INK)
          .text(value, x + 6, y + 18, { width: cardW - 12, lineBreak: false, ellipsis: true });
      });
      doc.y = y + cardH + gap;
    }
  }
  /** Tabel label–nilai 2 kolom (rumus/definisi, rekonsiliasi). */
  keyValues(rows: Array<[string, string, boolean?]>, labelWidth = 0.6) {
    const { doc } = this;
    for (const [label, value, strong] of rows) {
      const lw = this.width * labelWidth;
      doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      const h =
        Math.max(doc.heightOfString(label, { width: lw - 8 }), doc.heightOfString(value, { width: this.width - lw - 4 }), 10) + 6;
      this.ensure(h);
      const y = doc.y;
      doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(INK).text(label, this.left + 4, y + 3, { width: lw - 8 });
      doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).text(value, this.left + lw, y + 3, { width: this.width - lw - 4, align: labelWidth < 0.35 ? "left" : "right" });
      doc.moveTo(this.left, y + h).lineTo(this.left + this.width, y + h).lineWidth(0.3).strokeColor(LINE).stroke();
      doc.y = y + h;
    }
    doc.moveDown(0.3);
  }
  table(columns: Column[], rows: string[][], opts: { totals?: string[]; empty?: string; fontSize?: number } = {}) {
    const { doc } = this;
    const size = opts.fontSize ?? 7.5;
    const total = columns.reduce((sum, col) => sum + col.width, 0);
    const widths = columns.map((col) => (col.width / total) * this.width);
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(this.left, y, this.width, 16).fill("#1f1f23");
      let x = this.left;
      columns.forEach((col, index) => {
        doc.font("Helvetica-Bold").fontSize(size).fillColor("#ffffff").text(col.label, x + 3, y + 4, {
          width: widths[index] - 6,
          align: col.align ?? "left",
          lineBreak: false,
          ellipsis: true,
        });
        x += widths[index];
      });
      doc.y = y + 16;
    };
    this.ensure(32);
    drawHeader();
    if (!rows.length) {
      doc.font("Helvetica-Oblique").fontSize(size + 0.5).fillColor(MUTED).text(opts.empty ?? "Tidak ada data.", this.left + 4, doc.y + 4, { width: this.width - 8 });
      doc.moveDown(0.6);
      return;
    }
    const drawRow = (cells: string[], index: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      const height = Math.max(...cells.map((cell, i) => doc.heightOfString(cell || "-", { width: widths[i] - 6 }))) + 6;
      if (doc.y + height > this.bottom) {
        this.page(doc.page.layout as "portrait" | "landscape");
        drawHeader();
      }
      const y = doc.y;
      if (bold) doc.rect(this.left, y, this.width, height).fill("#e4e4e7");
      else if (index % 2 === 1) doc.rect(this.left, y, this.width, height).fill(ZEBRA);
      let x = this.left;
      cells.forEach((cell, i) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(INK).text(cell || "-", x + 3, y + 3, {
          width: widths[i] - 6,
          align: columns[i]?.align ?? "left",
        });
        x += widths[i];
      });
      doc.y = y + height;
    };
    rows.forEach((row, index) => drawRow(row, index));
    if (opts.totals) drawRow(opts.totals, 0, true);
    doc.moveDown(0.4);
  }
  finish(): Promise<Buffer> {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    const printed = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const marginBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text("GARAGE COFFEE · Garage OS", left, 18, { width: width / 2, lineBreak: false });
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(this.header, left + width / 2, 18, { width: width / 2, align: "right", lineBreak: false, ellipsis: true });
      const footerY = doc.page.height - marginBottom + 6;
      doc.moveTo(left, footerY - 4).lineTo(left + width, footerY - 4).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`Dicetak ${printed} WIB · data dari database & audit trail Garage OS`, left, footerY, { width: (width * 2) / 3, lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`Halaman ${i - range.start + 1} dari ${range.count}`, left + width / 2, footerY, { width: width / 2, align: "right", lineBreak: false });
      doc.page.margins.bottom = marginBottom;
    }
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  }
}

function cover(w: Writer, title: string, subtitle: string, rows: Array<[string, string]>) {
  w.page("portrait");
  const { doc } = w;
  const logo = loadLogo();
  if (logo) {
    try {
      doc.image(logo, w.left, doc.y, { fit: [150, 48] });
      doc.y += 54;
    } catch {
      doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text("GARAGE COFFEE", w.left, doc.y);
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text("GARAGE COFFEE", w.left, doc.y);
  }
  doc.moveTo(w.left, doc.y + 2).lineTo(w.left + w.width, doc.y + 2).lineWidth(2).strokeColor(RED).stroke();
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(title, w.left, doc.y, { width: w.width });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(subtitle, { width: w.width });
  doc.moveDown(0.6);
  w.keyValues(rows.map(([label, value]) => [label, value]), 0.4);
}

function statusTone(value: number | null) {
  if (value === null) return undefined;
  if (value === 0) return undefined;
  return Math.abs(value) > 10_000 ? "bad" : "warn";
}

/** Bagian lengkap satu shift (urutan sesuai standar laporan owner). */
function renderShift(w: Writer, report: ShiftAccountability, opts: { cashOnly?: boolean; label?: string } = {}) {
  const { session: s, sales, cash } = report;
  const head = `${opts.label ? `${opts.label} · ` : ""}Shift ${s.shiftNumber} · ${s.cashierName ?? "-"} · ${s.code}`;

  // 2–3. Ringkasan eksekutif + informasi shift
  w.section(`Ringkasan Eksekutif — ${head}`, "portrait", "Omzet, tagihan, pembayaran diterima, dan kas fisik dipisah — bukan satu angka.");
  if (!opts.cashOnly) {
    w.paragraph("Penjualan", { bold: true, size: 9 });
    w.cards([
      ["Order dibuat", num(sales.ordersCreated)],
      ["Order selesai", num(sales.ordersCompleted)],
      ["Transaksi lunas", num(sales.paidCount)],
      ["Bayar sebagian", num(sales.partialCount), sales.partialCount ? "warn" : undefined],
      ["Pending", num(sales.pendingCount), sales.pendingCount ? "warn" : undefined],
      ["Dibatalkan", num(sales.cancelledCount)],
      ["Void", num(sales.voidCount), sales.voidCount ? "warn" : undefined],
      ["Refund", `${num(sales.refundCount)} · ${rp(sales.refundTotal)}`, sales.refundCount ? "warn" : undefined],
      ["Item terjual", num(sales.itemsSold)],
      ["Penjualan bruto", rp(sales.grossSales)],
      ["Total diskon", rp(sales.discountTotal)],
      ["Biaya tambahan", rp(sales.extraCharges)],
      ["Penjualan bersih", rp(sales.netSales)],
      ["Tagihan belum dibayar", rp(sales.unpaidTotal), sales.unpaidTotal ? "warn" : undefined],
      ["Pembayaran diterima", rp(sales.paymentsReceived)],
      ["Rata-rata transaksi", rp(sales.averageTicket)],
    ]);
  }
  w.paragraph("Aktivitas kas", { bold: true, size: 9 });
  w.cards([
    ["Kas awal", rp(cash.openingCash)],
    ["Penerimaan tunai", rp(cash.cashSales)],
    ["Kas masuk", rp(cash.cashIn)],
    ["Kas keluar", rp(cash.cashOut)],
    ["Refund/void tunai", rp(cash.cashRefundsVoids)],
    ["Petty cash (shift)", rp(report.petty.filter((p) => p.status === "approved" && p.type === "expense").reduce((sum, p) => sum + p.amount, 0))],
    ["Setoran ke Owner", rp(cash.deposit)],
    ["Kas seharusnya", rp(cash.expected)],
    ["Kas aktual", rp(cash.actual)],
    ["Selisih kas", rp(cash.variance), statusTone(cash.variance)],
    ["Non-tunai", rp(cash.nonCashTotal)],
    ["QRIS", rp(cash.qris)],
    ["Transfer", rp(cash.transfer)],
    ["Metode lain", rp(cash.otherNonCash)],
  ]);

  w.section("Informasi Shift & Kas Awal", "portrait");
  w.keyValues([
    ["Tanggal operasional", longDate(s.businessDate)],
    ["Nomor shift", `Shift ${s.shiftNumber}`],
    ["Kasir bertugas", text(s.cashierName)],
    ["ID shift", s.code],
    ["Outlet", text(s.outletName ?? s.outletCode)],
    ["Mulai", dateTime(s.openedAt)],
    ["Selesai", dateTime(s.closedAt)],
    ["Durasi", duration(s.durationMinutes)],
    ["Status shift", s.shiftStatus, true],
    ["Saldo kas awal", rp(s.openingCash), true],
    ["Modal awal dihitung oleh", text(s.cashierName)],
    ["Modal awal diverifikasi", s.openingVerifiedByName ? `${s.openingVerifiedByName} · ${dateTime(s.openingVerifiedAt)}` : "Belum diverifikasi"],
    ["Ditutup oleh", s.closedByName ? `${s.closedByName} · ${dateTime(s.closedAt)}` : "-"],
    ["Diperiksa Manajer", s.reviewedByName ? `${s.reviewedByName} · ${dateTime(s.reviewedAt)}` : "Belum diperiksa"],
    ["Catatan penutupan", text(s.closingNote)],
  ]);
  if (report.dataGaps.length) {
    w.paragraph("Data yang belum tersedia / perlu diperhatikan:", { bold: true, color: AMBER });
    for (const gap of report.dataGaps) w.paragraph(`• ${gap}`, { color: AMBER });
  }

  if (!opts.cashOnly) {
    // 4–5. Detail transaksi & pembayaran
    w.section("Detail Transaksi Penjualan", "landscape", "Setiap invoice dengan produk, varian, qty, harga satuan (snapshot), diskon, biaya, pembayaran & status.");
    w.table(
      [
        { label: "No", width: 3, align: "right" },
        { label: "Invoice", width: 10 },
        { label: "Waktu", width: 6 },
        { label: "Kasir", width: 8 },
        { label: "Pelanggan / Meja", width: 11 },
        { label: "Jenis", width: 8 },
        { label: "Produk (qty × harga)", width: 22 },
        { label: "Subtotal", width: 8, align: "right" },
        { label: "Diskon", width: 7, align: "right" },
        { label: "Biaya", width: 6, align: "right" },
        { label: "Total", width: 8, align: "right" },
        { label: "Dibayar", width: 8, align: "right" },
        { label: "Sisa", width: 7, align: "right" },
        { label: "Metode", width: 8 },
        { label: "Status bayar / order", width: 10 },
      ],
      report.transactions.map((tx) => [
        String(tx.no),
        tx.orderNo,
        time(tx.createdAt),
        text(tx.cashierName),
        `${text(tx.customerName)} / ${text(tx.tableLabel)}`,
        tx.channelLabel,
        tx.items.map((item) => `${item.qty}× ${item.itemName}${item.variantLabel && item.variantLabel.toLowerCase() !== "regular" ? ` (${item.variantLabel})` : ""} @${num(item.unitPrice)}${item.note ? ` — ${item.note}` : ""}`).join("\n") || "-",
        rp(tx.subtotal),
        tx.discount ? rp(tx.discount) : "-",
        tx.extraCharges ? rp(tx.extraCharges) : "-",
        rp(tx.total),
        rp(tx.paidAmount),
        tx.balanceDue ? rp(tx.balanceDue) : "-",
        tx.payments.filter((p) => p.status !== "pending").map((p) => `${p.method} ${num(p.amount)}${p.status !== "captured" ? ` (${p.status})` : ""}`).join("\n") || "-",
        `${tx.paymentStatus} / ${tx.status}${tx.customerNote ? `\nCatatan: ${tx.customerNote}` : ""}`,
      ]),
      {
        empty: "Tidak ada transaksi di shift ini.",
        totals: ["", "TOTAL", "", "", "", "", `${report.transactions.length} transaksi`, rp(report.transactions.reduce((s2, t) => s2 + t.subtotal, 0)), rp(report.transactions.reduce((s2, t) => s2 + t.discount, 0)), rp(report.transactions.reduce((s2, t) => s2 + t.extraCharges, 0)), rp(report.transactions.reduce((s2, t) => s2 + t.total, 0)), rp(report.transactions.reduce((s2, t) => s2 + t.paidAmount, 0)), rp(sales.unpaidTotal), "", ""],
      },
    );

    // 6. Produk terjual
    w.section("Rekap Produk Terjual (per satuan)", "landscape", "Qty dari transaksi aktual. Batal/refund = item pada order void/batal/refund. Bersih = terjual − batal/refund. Konsumsi bahan baku dihitung terpisah lewat resep & inventori.");
    const productTotals = report.products.reduce((acc, p) => ({ sold: acc.sold + p.sold, cancelled: acc.cancelled + p.cancelled, net: acc.net + p.net, total: acc.total + p.total }), { sold: 0, cancelled: 0, net: 0, total: 0 });
    w.table(
      [
        { label: "Produk", width: 20 },
        { label: "Kategori", width: 12 },
        { label: "Varian", width: 10 },
        { label: "Satuan", width: 7 },
        { label: "Terjual", width: 8, align: "right" },
        { label: "Batal/Refund", width: 9, align: "right" },
        { label: "Bersih", width: 8, align: "right" },
        { label: "Harga jual", width: 10, align: "right" },
        { label: "Total penjualan", width: 12, align: "right" },
      ],
      report.products.map((p) => [p.name, p.category, p.variant, p.unit, num(p.sold), num(p.cancelled), num(p.net), rp(p.price), rp(p.total)]),
      { empty: "Belum ada produk terjual.", totals: ["TOTAL", "", "", "", num(productTotals.sold), num(productTotals.cancelled), num(productTotals.net), "", rp(productTotals.total)] },
    );

    // 7. Metode pembayaran
    w.section("Rekap Metode Pembayaran", "portrait", "Pembayaran berstatus captured yang masuk ke sesi kas ini. Hanya Tunai yang masuk perhitungan uang fisik.");
    w.table(
      [
        { label: "Metode", width: 30 },
        { label: "Kelompok", width: 20 },
        { label: "Jumlah transaksi", width: 20, align: "right" },
        { label: "Total", width: 30, align: "right" },
      ],
      report.methods.map((m) => [m.method, m.group, num(m.count), rp(m.total)]),
      { empty: "Belum ada pembayaran.", totals: ["TOTAL", "", num(report.methods.reduce((a, m) => a + m.count, 0)), rp(report.methods.reduce((a, m) => a + m.total, 0))] },
    );
    if (s.qrisCounted !== null) {
      w.keyValues([
        ["QRIS tercatat sistem", rp(s.qrisRecorded)],
        ["QRIS di aplikasi bank", rp(s.qrisCounted)],
        ["Selisih QRIS", rp(s.qrisDiscrepancy), true],
      ]);
    }
  }

  // 8. Buku kas
  w.section("Buku Kas Masuk & Kas Keluar (laci)", "landscape", "Kas keluar operasional, refund, dan setoran dicatat terpisah agar saldo tidak berkurang dua kali.");
  w.table(
    [
      { label: "No. transaksi", width: 9 },
      { label: "Waktu", width: 9 },
      { label: "Jenis", width: 6 },
      { label: "Kategori", width: 11 },
      { label: "Nominal", width: 9, align: "right" },
      { label: "Metode", width: 5 },
      { label: "Sumber / penerima", width: 10 },
      { label: "Keperluan", width: 17 },
      { label: "Bukti / invoice", width: 10 },
      { label: "Dicatat", width: 8 },
      { label: "Disetujui", width: 8 },
      { label: "Status", width: 6 },
    ],
    report.movements.map((m) => [
      `KM-${m.id.slice(0, 6).toUpperCase()}`,
      dateTime(m.movementAt),
      m.type === "cash_in" ? "Masuk" : "Keluar",
      m.category,
      rp(m.amount),
      "Tunai",
      text(m.counterparty),
      m.description,
      [m.referenceNo, m.orderNo].filter(Boolean).join(" · ") || "-",
      text(m.createdByName),
      m.approvedByName ?? "Di bawah batas PIN",
      m.status === "recorded" ? "Tercatat" : m.status,
    ]),
    { empty: "Tidak ada kas masuk/keluar di shift ini.", totals: ["TOTAL", "", "", "", `+${num(cash.cashIn)} / −${num(cash.cashOut)}`, "", "", "", "", "", "", ""] },
  );

  // 9. Petty cash shift
  w.section("Petty Cash (tercatat di shift ini)", "landscape", "Dana kas kecil terpisah dari laci — tidak mengubah kas laci. Pengajuan yang belum diputuskan tidak dihitung sebagai pengeluaran final.");
  w.table(
    [
      { label: "No.", width: 10 },
      { label: "Waktu", width: 9 },
      { label: "Jenis", width: 7 },
      { label: "Kategori", width: 11 },
      { label: "Uraian", width: 18 },
      { label: "Nominal", width: 9, align: "right" },
      { label: "Penerima", width: 9 },
      { label: "Bukti", width: 8 },
      { label: "Petugas", width: 8 },
      { label: "Disetujui", width: 8 },
      { label: "Status", width: 8 },
    ],
    report.petty.map((p) => [
      p.entryNo,
      dateTime(p.entryAt),
      p.type === "topup" ? "Tambah" : p.type === "expense" ? "Keluar" : "Penyesuaian",
      p.category,
      `${p.description}${p.decisionNote ? `\nCatatan: ${p.decisionNote}` : ""}`,
      rp(p.amount),
      text(p.recipient),
      [p.receiptNo, p.receiptUrl ? "foto" : null].filter(Boolean).join(" · ") || "-",
      text(p.createdByName),
      text(p.approvedByName),
      PETTY_CASH_STATUS_LABEL[p.status],
    ]),
    { empty: "Tidak ada transaksi petty cash di shift ini." },
  );

  // 10. Pecahan buka & tutup
  w.section("Uang Pecahan — Pembukaan & Penutupan", "portrait", "Total per pecahan = jumlah lembar/keping × nilai pecahan.");
  const openRows = denominationRows(s.openingDenominations);
  const closeRows = denominationRows(s.denominations);
  const openTotal = openRows.reduce((sum, row) => sum + row.total, 0);
  const closeTotal = closeRows.reduce((sum, row) => sum + row.total, 0);
  w.table(
    [
      { label: "Pecahan", width: 22 },
      { label: "Buka (lembar/keping)", width: 18, align: "right" },
      { label: "Total buka", width: 20, align: "right" },
      { label: "Tutup (lembar/keping)", width: 18, align: "right" },
      { label: "Total tutup", width: 22, align: "right" },
    ],
    openRows.map((row, index) => [row.label, num(row.qty), rp(row.total), num(closeRows[index].qty), rp(closeRows[index].total)]),
    {
      totals: [
        "TOTAL",
        num(openRows.reduce((sum, row) => sum + row.qty, 0)),
        Object.keys(s.openingDenominations).length ? rp(openTotal) : "Tidak dihitung",
        num(closeRows.reduce((sum, row) => sum + row.qty, 0)),
        Object.keys(s.denominations).length ? rp(closeTotal) : s.status === "open" ? "Shift berlangsung" : "Tidak dihitung",
      ],
    },
  );

  if (!opts.cashOnly) {
    // 11. Void
    w.section("Register Void & Pembatalan", "landscape", "Semua permintaan — termasuk yang ditolak & masih diajukan. Permintaan belum disetujui tidak dihitung sebagai void.");
    w.table(
      [
        { label: "No. permintaan", width: 12 },
        { label: "Invoice", width: 10 },
        { label: "Waktu", width: 9 },
        { label: "Pengaju", width: 9 },
        { label: "Jenis", width: 9 },
        { label: "Produk / qty", width: 14 },
        { label: "Nilai", width: 7, align: "right" },
        { label: "Alasan", width: 12 },
        { label: "Status", width: 7 },
        { label: "Diputuskan", width: 10 },
        { label: "Dampak", width: 13 },
      ],
      report.voids.map((v) => [v.id, v.orderNo, dateTime(v.createdAt), v.requester, v.scope, v.items, v.amount, `${v.reason}${v.decisionNote ? `\nKeputusan: ${v.decisionNote}` : ""}`, v.status, v.decidedByName ? `${v.decidedByName}\n${dateTime(v.decidedAt)}` : "-", v.impact]),
      { empty: "Tidak ada permintaan void/pembatalan." },
    );

    // 12. Refund, diskon, koreksi
    w.section("Refund, Diskon & Koreksi Pembayaran", "landscape", "Refund mengurangi penjualan & kas/metode asal; diskon mengurangi tagihan; koreksi metode tidak mengubah total.");
    w.table(
      [
        { label: "Jenis", width: 12 },
        { label: "Invoice", width: 10 },
        { label: "Nominal", width: 8, align: "right" },
        { label: "Rincian", width: 15 },
        { label: "Alasan", width: 13 },
        { label: "Petugas", width: 10 },
        { label: "Disetujui", width: 9 },
        { label: "Waktu", width: 9 },
        { label: "Status", width: 7 },
        { label: "Dampak", width: 14 },
      ],
      report.adjustments.map((a) => [a.kind, a.orderNo, a.amount === null ? "-" : rp(a.amount), a.detail, a.reason, a.by, a.approvedBy, dateTime(a.at), a.status, a.impact]),
      { empty: "Tidak ada refund, diskon, atau koreksi pembayaran." },
    );
  }

  // 13. Kejadian
  w.section("Catatan Kejadian & Aktivitas Operasional", "landscape");
  w.table(
    [
      { label: "Waktu", width: 9 },
      { label: "Kategori", width: 10 },
      { label: "Deskripsi", width: 20 },
      { label: "Invoice", width: 8 },
      { label: "Dampak (Rp)", width: 8, align: "right" },
      { label: "Pelapor", width: 8 },
      { label: "Tindakan", width: 14 },
      { label: "Penanggung jawab", width: 9 },
      { label: "Status", width: 7 },
      { label: "Catatan Manajer", width: 12 },
    ],
    report.incidents.map((i) => [
      dateTime(i.occurredAt),
      i.category,
      i.description,
      text(i.orderNo),
      i.financialImpact === null ? "-" : rp(i.financialImpact),
      text(i.reportedByName),
      text(i.actionTaken),
      text(i.responsibleName),
      `${INCIDENT_STATUS_LABEL[i.status as IncidentStatus] ?? i.status}${i.resolvedByName ? `\n${i.resolvedByName}` : ""}`,
      text(i.managerNote),
    ]),
    { empty: "Tidak ada kejadian yang dicatat di shift ini." },
  );

  // 14. Rekonsiliasi
  w.section("Rekonsiliasi Kas & Selisih", "portrait", "Kas diharapkan = Kas awal + Penerimaan tunai + Kas masuk − Kas keluar − Refund/void tunai ± Penyesuaian lain. Selisih = Kas aktual − Kas diharapkan.");
  w.keyValues([
    ["Kas awal", rp(cash.openingCash)],
    ["+ Penerimaan tunai penjualan", rp(cash.cashSales)],
    ["+ Kas masuk lainnya", rp(cash.cashIn)],
    ["− Kas keluar (operasional/setoran di tengah shift)", rp(cash.cashOut)],
    ["− Refund / void tunai", rp(cash.cashRefundsVoids)],
    ["± Penyesuaian lain (pengeluaran Finance tunai, koreksi metode, pembatalan pelunasan)", rp(cash.otherAdjustments)],
    ["= Kas yang diharapkan", rp(cash.expected), true],
    ["Kas aktual (hitung pecahan)", rp(cash.actual), true],
    ["Selisih kas", cash.variance === null ? "Belum ditutup" : rp(cash.variance), true],
    ["Status selisih", s.status === "open" ? "-" : s.discrepancyStatus === "ok" ? "Wajar" : s.discrepancyStatus === "review" ? "Perlu diperiksa" : "Kritis"],
    ["Persetujuan selisih", s.managerSignOffByName ? `${s.managerSignOffByName} · ${dateTime(s.managerSignOffAt)}` : "-"],
  ]);

  // 15. Persetujuan & serah terima
  w.section("Persetujuan Manajer & Serah Terima Shift", "portrait", "Status di bawah adalah status sebenarnya di sistem saat dokumen dicetak.");
  const checklistDone = s.checklist.filter((item) => item.done).length;
  w.paragraph("Kasir", { bold: true, size: 9 });
  w.keyValues([
    ["Pernyataan pemeriksaan", s.status === "closed" ? `Checklist tutup shift ${checklistDone}/${s.checklist.length} dicentang oleh kasir` : "Shift belum ditutup"],
    ["Kas aktual", rp(cash.actual)],
    ["Selisih kas", cash.variance === null ? "-" : rp(cash.variance)],
    ["Catatan pertanggungjawaban", text(s.closingNote)],
    ["Diajukan tutup oleh", s.closedByName ? `${s.closedByName} · ${dateTime(s.closedAt)}` : "-"],
  ]);
  w.paragraph("Manajer", { bold: true, size: 9 });
  w.keyValues([
    ["Status pemeriksaan", s.reviewLabel, true],
    ["Catatan / tindak lanjut", text(s.reviewNote)],
    ["Diverifikasi oleh", s.reviewedByName ? `${s.reviewedByName} · ${dateTime(s.reviewedAt)}` : "Belum diverifikasi"],
  ]);
  w.paragraph("Serah terima", { bold: true, size: 9 });
  const openIncidents = report.incidents.filter((i) => i.status !== "resolved").length;
  const pendingPetty = report.petty.filter((p) => p.status === "submitted").length;
  const pendingVoids = report.voids.filter((v) => v.status === "Diajukan").length;
  w.keyValues([
    ["Kasir yang menyerahkan", text(s.cashierName)],
    ["Uang ditinggal di laci (modal shift berikut)", rp(cash.floatLeft)],
    ["Disetor ke Owner/brankas", rp(cash.deposit)],
    ["Kasir penerima (shift berikutnya)", report.handover.next ? `${text(report.handover.next.cashierName)} · ${report.handover.next.code} · buka ${dateTime(report.handover.next.openedAt)} · modal ${rp(report.handover.next.openingCash)}` : "Belum ada shift berikutnya"],
    ["Diterima dari shift sebelumnya", report.handover.previous ? `${text(report.handover.previous.cashierName)} · ${report.handover.previous.code} · ditinggal ${rp(report.handover.previous.floatLeft)}` : "-"],
    ["Transaksi masih terbuka", `${sales.pendingCount + sales.partialCount} order · ${rp(sales.unpaidTotal)}`],
    ["Pengajuan belum selesai", `${pendingVoids} void · ${pendingPetty} petty cash · ${openIncidents} kejadian terbuka`],
  ]);
  w.doc.moveDown(1.2);
  w.ensure(70);
  const y = w.doc.y + 30;
  const col = w.width / 3;
  ["Kasir", "Manajer", "Kasir penerima"].forEach((label, index) => {
    const x = w.left + index * col + 10;
    w.doc.moveTo(x, y).lineTo(x + col - 30, y).lineWidth(0.6).strokeColor(INK).stroke();
    w.doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, x, y + 4, { width: col - 30, align: "center" });
  });
  w.doc.y = y + 20;
}

function definitionsPage(w: Writer) {
  w.section("Definisi & Rumus Angka", "portrait", "Setiap angka di laporan ini berasal dari database & audit trail dengan definisi berikut.");
  w.keyValues(SHIFT_REPORT_DEFINITIONS.map(([label, value]) => [label, value]), 0.25);
}

function pettyDaySection(w: Writer, petty: PettyDay, date: string) {
  w.section(`Laporan Petty Cash — ${longDate(date)}`, "landscape", "Saldo akhir = Saldo awal + Penambahan disetujui − Pengeluaran disetujui ± Penyesuaian. Pengajuan & yang ditolak ditampilkan terpisah, tidak mengubah saldo.");
  w.cards([
    ["Saldo awal", rp(petty.openingBalance)],
    ["Penambahan dana", rp(petty.topups)],
    ["Pengeluaran disetujui", rp(petty.expenses)],
    ["Penyesuaian", rp(petty.adjustments)],
    ["Saldo akhir", rp(petty.closingBalance)],
    ["Menunggu persetujuan", `${petty.pendingCount} · ${rp(petty.pendingExpenseTotal)}`, petty.pendingCount ? "warn" : undefined],
    ["Ditolak", num(petty.rejectedCount)],
  ], 4);
  w.table(
    [
      { label: "No.", width: 10 },
      { label: "Waktu", width: 9 },
      { label: "Jenis", width: 7 },
      { label: "Kategori", width: 10 },
      { label: "Uraian", width: 17 },
      { label: "Nominal", width: 8, align: "right" },
      { label: "Penerima", width: 8 },
      { label: "Bukti", width: 7 },
      { label: "Petugas", width: 7 },
      { label: "Disetujui", width: 7 },
      { label: "Status", width: 6 },
      { label: "Saldo", width: 8, align: "right" },
    ],
    petty.ledger.map((p) => [
      p.entryNo,
      dateTime(p.entryAt),
      p.type === "topup" ? "Tambah" : p.type === "expense" ? "Keluar" : "Penyesuaian",
      p.category,
      `${p.description}${p.decisionNote ? `\nCatatan: ${p.decisionNote}` : ""}`,
      rp(p.amount),
      text(p.recipient),
      text(p.receiptNo),
      text(p.createdByName),
      text(p.approvedByName),
      PETTY_CASH_STATUS_LABEL[p.status],
      p.runningBalance === null ? "-" : rp(p.runningBalance),
    ]),
    { empty: "Tidak ada transaksi petty cash di tanggal ini." },
  );
}

/** PDF satu shift lengkap (15 bagian). */
export async function renderShiftAccountabilityPdf(report: ShiftAccountability) {
  const s = report.session;
  const w = new Writer(`Shift ${s.shiftNumber} · ${s.cashierName ?? "-"} · ${s.businessDate}`);
  cover(w, ACCOUNTABILITY_KIND_TITLE.shift, longDate(s.businessDate), [
    ["Kasir", text(s.cashierName)],
    ["Shift", `Shift ${s.shiftNumber} · ${s.code}`],
    ["Waktu", `${dateTime(s.openedAt)} — ${s.closedAt ? dateTime(s.closedAt) : "berlangsung"}`],
    ["Status", s.shiftStatus],
    ["Pemeriksaan Manajer", s.reviewLabel],
  ]);
  renderShift(w, report);
  definitionsPage(w);
  return w.finish();
}

/** PDF harian: beberapa shift (per kasir / semua kasir / kas saja / gabungan). */
export async function renderDailyAccountabilityPdf(params: {
  kind: Exclude<AccountabilityPdfKind, "shift">;
  date: string;
  outletName: string | null;
  cashierName?: string | null;
  reports: ShiftAccountability[];
  petty?: PettyDay | null;
}) {
  const { kind, date, reports } = params;
  const w = new Writer(`${ACCOUNTABILITY_KIND_TITLE[kind]} · ${date}`);
  const totals = reports.reduce(
    (acc, r) => ({
      net: acc.net + r.sales.netSales,
      paid: acc.paid + r.sales.paidCount,
      received: acc.received + r.sales.paymentsReceived,
      cash: acc.cash + r.cash.cashSales,
      nonCash: acc.nonCash + r.cash.nonCashTotal,
      variance: acc.variance + (r.cash.variance ?? 0),
      voids: acc.voids + r.voids.length,
      incidents: acc.incidents + r.incidents.length,
    }),
    { net: 0, paid: 0, received: 0, cash: 0, nonCash: 0, variance: 0, voids: 0, incidents: 0 },
  );
  cover(w, ACCOUNTABILITY_KIND_TITLE[kind], longDate(date), [
    ["Outlet", text(params.outletName)],
    ...(params.cashierName ? ([["Kasir", params.cashierName]] as Array<[string, string]>) : []),
    ["Jumlah shift", num(reports.length)],
    ["Penjualan bersih (lunas)", rp(totals.net)],
    ["Pembayaran diterima", rp(totals.received)],
    ["Penerimaan tunai / non-tunai", `${rp(totals.cash)} / ${rp(totals.nonCash)}`],
    ["Total selisih kas", rp(totals.variance)],
    ...(params.petty ? ([["Saldo petty cash akhir hari", rp(params.petty.closingBalance)]] as Array<[string, string]>) : []),
  ]);
  w.section("Rekap Shift Hari Ini", "landscape");
  w.table(
    [
      { label: "Shift", width: 6 },
      { label: "Kasir", width: 12 },
      { label: "Kode", width: 14 },
      { label: "Buka – Tutup", width: 14 },
      { label: "Lunas", width: 6, align: "right" },
      { label: "Penjualan bersih", width: 11, align: "right" },
      { label: "Kas awal", width: 9, align: "right" },
      { label: "Kas seharusnya", width: 10, align: "right" },
      { label: "Kas aktual", width: 9, align: "right" },
      { label: "Selisih", width: 8, align: "right" },
      { label: "Status", width: 12 },
    ],
    reports.map((r) => [
      `Shift ${r.session.shiftNumber}`,
      text(r.session.cashierName),
      r.session.code,
      `${time(r.session.openedAt)} – ${r.session.closedAt ? time(r.session.closedAt) : "berlangsung"}`,
      num(r.sales.paidCount),
      rp(r.sales.netSales),
      rp(r.cash.openingCash),
      rp(r.cash.expected),
      rp(r.cash.actual),
      r.cash.variance === null ? "-" : rp(r.cash.variance),
      r.session.shiftStatus,
    ]),
    { empty: "Tidak ada shift di tanggal ini.", totals: ["TOTAL", "", "", "", num(totals.paid), rp(totals.net), "", "", "", rp(totals.variance), ""] },
  );
  for (const report of reports) renderShift(w, report, { cashOnly: kind === "cash", label: report.session.cashierName ?? undefined });
  if (params.petty && (kind === "cash" || kind === "combined")) pettyDaySection(w, params.petty, date);
  definitionsPage(w);
  return w.finish();
}
