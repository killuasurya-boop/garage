// =============================================================================
// SMART PARTNER HUB — PDF Laporan Settlement Mitra (PRD 14), pdfkit A4 LANDSCAPE.
// - Logo resmi public/garage-brand/garage-coffee-logo.png. FINAL tanpa logo = DITOLAK (fail-closed, UAT-23).
// - Setiap baris transaksi: no order, tanggal/jam, meja, pemesan, produk/varian, qty, harga jual, total jual,
//   HPP/unit, total HPP, profit kotor Garage, hak mitra. Header tabel diulang tiap halaman, "Hal. n/N".
// - DRAFT diberi watermark. Angka berasal dari snapshot settlement (server), bukan dari layar.
// Font Helvetica (WinAnsi): hindari simbol di luar WinAnsi.
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { SETTLEMENT_STATUS_LABEL } from "@/lib/partner-hub-rules";

type Doc = InstanceType<typeof PDFDocument>;

export type PartnerReportData = {
  reportNo: string;
  version: number;
  kind: "draft" | "final";
  audience: "partner" | "internal";
  generatedAt: Date;
  outletName: string;
  partner: { code: string; name: string; productKind: string | null; address: string | null };
  settlement: {
    settlementNo: string;
    status: string;
    periodFrom: Date;
    periodTo: Date;
    totalQty: number;
    grossSales: number;
    salesAdjustments: number;
    totalCost: number;
    liabilityAdjustments: number;
    garageProfit: number;
    liabilityTotal: number;
    paidAmount: number;
    approvedAt: Date | null;
    approvedByName: string | null;
    createdAt: Date;
  };
  lines: Array<{
    kind: "sale" | "adjustment";
    orderNo: string;
    createdAt: Date;
    tableLabel: string | null;
    customerName: string | null;
    itemName: string;
    variantLabel: string;
    qty: number;
    unitPrice: number;
    unitCost: number;
    sales: number;
    cost: number;
    profit: number;
    liability: number;
    status: string;
  }>;
  payouts: Array<{ amount: number; reference: string; paidAt: Date; status: string; fundSource?: string; selfVerified?: boolean }>;
};

export class PartnerReportLogoMissingError extends Error {
  constructor() {
    super("Logo resmi Garage Coffee tidak ditemukan. PDF FINAL tidak diterbitkan sampai aset logo tersedia.");
    this.name = "PartnerReportLogoMissingError";
  }
}

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 30;
const W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 26;
const CONTENT_BOTTOM = PAGE_H - 46;

const C = { asphalt: "#141416", ink: "#1a1a1a", muted: "#55555d", line: "#d6d6dc", soft: "#f4f4f6", red: "#c8102e", redSoft: "#fdf1f3", cream: "#f7f1e8" };

const rp = (n: number) => `${n < 0 ? "-" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)))}`;
const rpLabel = (n: number) => `Rp ${rp(n)}`;
const dateWib = (d: Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }).format(d);
const timeWib = (d: Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export function partnerLogoPath() {
  const p = path.join(process.cwd(), "public", "garage-brand", "garage-coffee-logo.png");
  return fs.existsSync(p) ? p : null;
}

function txt(doc: Doc, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" | "center" } = {}) {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size ?? 8)
    .fillColor(opts.color ?? C.ink)
    .text(value, x, y, { width: opts.width, align: opts.align ?? "left", lineBreak: Boolean(opts.width), ellipsis: true, height: opts.width ? (opts.size ?? 8) * 2.6 : undefined });
}

const COLUMNS: Array<{ key: string; label: string; width: number; align?: "left" | "right" | "center" }> = [
  { key: "no", label: "No", width: 22, align: "center" },
  { key: "time", label: "Tanggal/Jam", width: 62 },
  { key: "order", label: "No. Order", width: 78 },
  { key: "table", label: "Meja", width: 46 },
  { key: "customer", label: "Pemesan", width: 74 },
  { key: "product", label: "Produk / Varian", width: 132 },
  { key: "qty", label: "Qty", width: 28, align: "right" },
  { key: "price", label: "Harga Jual", width: 54, align: "right" },
  { key: "sales", label: "Total Jual", width: 58, align: "right" },
  { key: "unitCost", label: "HPP/unit", width: 50, align: "right" },
  { key: "cost", label: "Total HPP", width: 56, align: "right" },
  { key: "profit", label: "Profit Garage", width: 60, align: "right" },
  { key: "liability", label: "Hak Mitra", width: 61.89, align: "right" },
];

function drawTableHeader(doc: Doc, y: number) {
  doc.rect(M, y, W, 18).fill(C.asphalt);
  let x = M;
  for (const col of COLUMNS) {
    txt(doc, col.label, x + 3, y + 5, { size: 7, bold: true, color: "#ffffff", width: col.width - 6, align: col.align });
    x += col.width;
  }
  return y + 18;
}

function drawHeader(doc: Doc, data: PartnerReportData, logo: string | null) {
  doc.rect(0, 0, PAGE_W, 70).fill(C.asphalt);
  doc.rect(0, 70, PAGE_W, 3).fill(C.red);
  if (logo) doc.image(logo, M, 12, { fit: [170, 46] });
  else txt(doc, "GARAGE COFFEE", M, 26, { size: 18, bold: true, color: "#ffffff" });
  txt(doc, data.audience === "partner" ? "LAPORAN SETTLEMENT MITRA" : "LAPORAN SETTLEMENT MITRA — INTERNAL", M + 200, 18, { size: 15, bold: true, color: "#ffffff", width: 360 });
  txt(doc, "Garage OS - Smart Partner Hub", M + 200, 40, { size: 8.5, color: "#c9c9cf", width: 360 });
  txt(doc, "No. Dokumen", M + W - 200, 16, { size: 7, color: "#c9c9cf", width: 200, align: "right" });
  txt(doc, `${data.reportNo}`, M + W - 200, 27, { size: 10, bold: true, color: "#ffffff", width: 200, align: "right" });
  txt(doc, `Versi ${data.version} · ${data.kind === "final" ? "FINAL" : "DRAFT"}`, M + W - 200, 43, { size: 8, color: data.kind === "final" ? "#ffffff" : "#ffb3b8", width: 200, align: "right" });

  const y = 84;
  doc.roundedRect(M, y, W / 2 - 6, 62, 4).fillAndStroke(C.soft, C.line);
  txt(doc, "IDENTITAS MITRA", M + 10, y + 7, { size: 7.5, bold: true, color: C.red });
  txt(doc, `Nama Mitra : ${data.partner.name}`, M + 10, y + 20, { size: 8.5, bold: true });
  txt(doc, `Kode Mitra : ${data.partner.code}`, M + 10, y + 32, { size: 8 });
  txt(doc, `Outlet     : ${data.outletName}${data.partner.productKind ? `  ·  ${data.partner.productKind}` : ""}`, M + 10, y + 44, { size: 8 });
  const rx = M + W / 2 + 6;
  doc.roundedRect(rx, y, W / 2 - 6, 62, 4).fillAndStroke(C.soft, C.line);
  txt(doc, "PERIODE LAPORAN", rx + 10, y + 7, { size: 7.5, bold: true, color: C.red });
  const lastDay = new Date(data.settlement.periodTo.getTime() - 1);
  txt(doc, `Periode     : ${dateWib(data.settlement.periodFrom)} - ${dateWib(lastDay)}`, rx + 10, y + 20, { size: 8.5, bold: true });
  txt(doc, `No. Settlement : ${data.settlement.settlementNo}`, rx + 10, y + 32, { size: 8 });
  txt(doc, `Status      : ${SETTLEMENT_STATUS_LABEL[data.settlement.status] ?? data.settlement.status}  ·  Dicetak ${timeWib(data.generatedAt)} WIB`, rx + 10, y + 44, { size: 8 });
  return y + 74;
}

function drawWatermark(doc: Doc) {
  doc.save();
  doc.rotate(-24, { origin: [PAGE_W / 2, PAGE_H / 2] });
  doc.font("Helvetica-Bold").fontSize(90).fillColor(C.red).fillOpacity(0.08).text("DRAFT", 0, PAGE_H / 2 - 50, { width: PAGE_W, align: "center" });
  doc.restore();
  doc.fillOpacity(1);
}

/** Render PDF → { buffer, sha256 }. Isi sama (snapshot & pembayaran sama) → sidik sama. */
export async function renderPartnerReportPdf(data: PartnerReportData): Promise<{ buffer: Buffer; sha256: string; pages: number }> {
  const logo = partnerLogoPath();
  if (data.kind === "final" && !logo) throw new PartnerReportLogoMissingError();
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: M, bottom: 16, left: M, right: M },
    bufferPages: true,
    info: {
      Title: `Laporan Settlement Mitra ${data.reportNo}`,
      Author: "Garage Coffee",
      Subject: `Settlement ${data.partner.name} ${data.settlement.settlementNo}`,
      Creator: "Garage OS Smart Partner Hub",
      CreationDate: data.settlement.approvedAt ?? data.settlement.createdAt,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const newPage = () => {
    doc.addPage();
    doc.rect(0, 0, PAGE_W, 4).fill(C.red);
    txt(doc, `${data.reportNo} · ${data.partner.name} (lanjutan)`, M, 14, { size: 8, bold: true, color: C.muted });
    return drawTableHeader(doc, 30);
  };

  let y = drawHeader(doc, data, logo);
  txt(doc, "RINCIAN PENJUALAN PER TRANSAKSI", M, y, { size: 9, bold: true, color: C.red });
  y = drawTableHeader(doc, y + 13);
  data.lines.forEach((line, index) => {
    const rowH = 16;
    if (y + rowH > CONTENT_BOTTOM) y = newPage();
    if (index % 2 === 1) doc.rect(M, y, W, rowH).fill(C.cream);
    const values: Record<string, string> = {
      no: String(index + 1),
      time: timeWib(line.createdAt),
      order: line.orderNo,
      table: line.tableLabel ?? "Take away",
      customer: line.customerName ?? "-",
      product: line.variantLabel && line.variantLabel !== "Regular" ? `${line.itemName} (${line.variantLabel})` : line.itemName,
      qty: String(line.qty),
      price: line.kind === "sale" ? rp(line.unitPrice) : "-",
      sales: rp(line.sales),
      unitCost: line.kind === "sale" ? rp(line.unitCost) : "-",
      cost: rp(line.cost),
      profit: rp(line.profit),
      liability: rp(line.liability),
    };
    let x = M;
    for (const col of COLUMNS) {
      txt(doc, values[col.key], x + 3, y + 4.5, { size: 7.2, width: col.width - 6, align: col.align, color: line.kind === "adjustment" ? C.red : C.ink });
      x += col.width;
    }
    doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(0.3).stroke(C.line);
    y += rowH;
  });
  // Baris total (Σ baris = total settlement; dicek sebelum render).
  if (y + 18 > CONTENT_BOTTOM) y = newPage();
  const sum = (key: "qty" | "sales" | "cost" | "profit" | "liability") => data.lines.reduce((s, l) => s + l[key], 0);
  doc.rect(M, y, W, 18).fill("#5a1018");
  const totals: Record<string, string> = { product: "TOTAL", qty: String(sum("qty")), sales: rp(sum("sales")), cost: rp(sum("cost")), profit: rp(sum("profit")), liability: rp(sum("liability")) };
  let tx = M;
  for (const col of COLUMNS) {
    if (totals[col.key]) txt(doc, totals[col.key], tx + 3, y + 5, { size: 7.5, bold: true, color: "#ffffff", width: col.width - 6, align: col.align });
    tx += col.width;
  }
  y += 28;

  // Ringkasan settlement + pembayaran.
  const needed = 150 + data.payouts.length * 12;
  if (y + needed > CONTENT_BOTTOM) {
    doc.addPage();
    doc.rect(0, 0, PAGE_W, 4).fill(C.red);
    y = 24;
  }
  const s = data.settlement;
  const boxW = W / 2 - 8;
  doc.roundedRect(M, y, boxW, 132, 4).fillAndStroke(C.soft, C.line);
  txt(doc, "RINGKASAN SETTLEMENT", M + 10, y + 8, { size: 8, bold: true, color: C.red });
  const rows: Array<[string, number, boolean?]> = [
    ["Total qty dipenuhi", s.totalQty],
    ["Total penjualan (bruto)", s.grossSales],
    ["Penyesuaian penjualan (refund/diskon)", s.salesAdjustments],
    ["Total HPP mitra", s.totalCost],
    ["Penyesuaian kewajiban", s.liabilityAdjustments],
    ["Profit kotor Garage", s.garageProfit],
    ["SETORAN KE MITRA", s.liabilityTotal, true],
  ];
  rows.forEach(([label, value, strong], i) => {
    const ry = y + 24 + i * 14;
    if (strong) doc.rect(M + 6, ry - 3, boxW - 12, 15).fill(C.redSoft);
    txt(doc, label, M + 12, ry, { size: 8.2, bold: Boolean(strong) });
    txt(doc, i === 0 ? String(value) : rpLabel(value), M + boxW - 140, ry, { size: 8.2, bold: Boolean(strong), width: 128, align: "right", color: strong ? C.red : C.ink });
  });
  const px = M + boxW + 16;
  doc.roundedRect(px, y, boxW, 132, 4).fillAndStroke(C.soft, C.line);
  txt(doc, "STATUS SETORAN", px + 10, y + 8, { size: 8, bold: true, color: C.red });
  const verified = data.payouts.filter((p) => p.status === "verified");
  txt(doc, `Sudah dibayar (terverifikasi) : ${rpLabel(s.paidAmount)}`, px + 12, y + 24, { size: 8.2, bold: true });
  txt(doc, `Sisa setoran                  : ${rpLabel(s.liabilityTotal - s.paidAmount)}`, px + 12, y + 38, { size: 8.2, bold: true, color: s.liabilityTotal - s.paidAmount > 0 ? C.red : C.ink });
  let py = y + 56;
  for (const p of data.payouts.slice(0, 5)) {
    const extra = data.audience === "internal" ? ` · ${p.fundSource ?? "-"}${p.selfVerified ? " · tanpa pemeriksa kedua" : ""}` : "";
    txt(doc, `${dateWib(p.paidAt)} · ${rpLabel(p.amount)} · Ref ${p.reference} · ${p.status === "verified" ? "Terverifikasi" : p.status === "void" ? "Dibatalkan" : "Menunggu verifikasi"}${extra}`, px + 12, py, { size: 7.2, width: boxW - 24 });
    py += 12;
  }
  if (!verified.length && !data.payouts.length) txt(doc, "Belum ada pembayaran tercatat.", px + 12, py, { size: 7.5, color: C.muted });
  txt(doc, s.approvedAt ? `Disetujui Owner: ${s.approvedByName ?? "-"} · ${timeWib(s.approvedAt)} WIB` : "Belum disetujui Owner — dokumen belum final.", px + 12, y + 116, { size: 7.5, bold: true, color: s.approvedAt ? C.ink : C.red, width: boxW - 24 });
  y += 142;
  txt(
    doc,
    "Keterangan: Setoran ke mitra = HPP produk yang sudah disiapkan mitra (Siap Antar) ± penyesuaian yang disetujui. Profit Garage = penjualan bersih - setoran. Laporan dibuat Garage OS dari data transaksi tersimpan.",
    M,
    Math.min(y, CONTENT_BOTTOM - 10),
    { size: 7, color: C.muted, width: W },
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (data.kind === "draft") drawWatermark(doc);
    doc.moveTo(M, FOOTER_Y - 5).lineTo(M + W, FOOTER_Y - 5).lineWidth(0.5).stroke(C.line);
    txt(doc, `GARAGE COFFEE · Smart Partner Hub · ${data.audience === "partner" ? "Partner Settlement Report" : "Internal - tidak untuk mitra"}`, M, FOOTER_Y, { size: 7, color: C.muted, width: W - 200 });
    txt(doc, `${data.reportNo} · v${data.version} · Hal. ${i - range.start + 1}/${range.count}`, M + W - 200, FOOTER_Y, { size: 7, color: C.muted, width: 200, align: "right" });
  }
  doc.end();
  const buffer = await done;
  return { buffer, sha256: crypto.createHash("sha256").update(buffer).digest("hex"), pages: range.count };
}
