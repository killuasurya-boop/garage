// Purchase Order A4 (pdfkit) — dokumen resmi ke supplier.
// Font Helvetica standar (WinAnsi): hindari simbol di luar WinAnsi ("≥", emoji). "—", "·", "×" aman.
// Logo resmi: public/garage-brand/garage-coffee-logo.png (tidak diubah, hanya di-fit).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import type { PoDocument } from "@/lib/wms-procurement";

type Doc = InstanceType<typeof PDFDocument>;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 34;
const CONTENT_BOTTOM = PAGE_H - 60;

const C = {
  asphalt: "#141416",
  ink: "#1a1a1a",
  muted: "#55555d",
  line: "#d6d6dc",
  soft: "#f4f4f6",
  red: "#c8102e",
  redSoft: "#fdf1f3",
  amber: "#92400e",
  amberSoft: "#fff4e5",
  chrome: "#c9c9cf",
};

const num = (n: number, max = 3) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: max }).format(n);
const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const rpUnit = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)}`;

let logoCache: string | null | undefined;
function logoPath() {
  if (logoCache !== undefined) return logoCache;
  const p = path.join(process.cwd(), "public", "garage-brand", "garage-coffee-logo.png");
  logoCache = fs.existsSync(p) ? p : null;
  return logoCache;
}

function txt(doc: Doc, value: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" | "center"; lineGap?: number } = {}) {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size ?? 9)
    .fillColor(opts.color ?? C.ink)
    .text(value, x, y, { width: opts.width, align: opts.align ?? "left", lineGap: opts.lineGap ?? 1 });
}

function heightOf(doc: Doc, value: string, width: number, size: number, bold = false) {
  return doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).heightOfString(value || " ", { width, lineGap: 1 });
}

/** Header halaman pertama: pita aspal + logo resmi + identitas perusahaan + judul dokumen. */
function drawHeader(doc: Doc, data: PoDocument) {
  doc.rect(0, 0, PAGE_W, 92).fill(C.asphalt);
  doc.rect(0, 92, PAGE_W, 3).fill(C.red);
  const logo = logoPath();
  if (logo) doc.image(logo, M, 18, { fit: [210, 50] });
  else txt(doc, "GARAGE COFFEE", M, 34, { size: 20, bold: true, color: "#ffffff" });
  const right = M + W - 250;
  txt(doc, data.company.name.toUpperCase(), right, 20, { size: 11, bold: true, color: "#ffffff", width: 250, align: "right" });
  txt(doc, data.company.address || "-", right, 36, { size: 8, color: C.chrome, width: 250, align: "right" });
  const contact = [data.company.phone ? `Telp/WA ${data.company.phone}` : "", data.company.npwp ? `NPWP ${data.company.npwp}` : ""].filter(Boolean).join("  ·  ");
  txt(doc, contact || " ", right, 62, { size: 8, color: C.chrome, width: 250, align: "right" });

  let y = 112;
  txt(doc, "PURCHASE ORDER", M, y, { size: 18, bold: true, color: C.ink });
  txt(doc, "SURAT PESANAN PEMBELIAN", M, y + 22, { size: 9, bold: true, color: C.muted });
  // Kotak nomor & tanggal.
  const bx = M + W - 210;
  doc.roundedRect(bx, y - 4, 210, 52, 4).fillAndStroke(C.soft, C.line);
  txt(doc, "Nomor PO", bx + 10, y + 2, { size: 7.5, color: C.muted });
  txt(doc, data.po.revision > 0 ? `${data.po.doc}  REVISI ${data.po.revision}` : data.po.doc, bx + 10, y + 12, { size: 10.5, bold: true, color: C.red, width: 190 });
  txt(doc, "Tanggal pemesanan", bx + 10, y + 28, { size: 7.5, color: C.muted });
  txt(doc, data.orderDateLabel, bx + 10, y + 37, { size: 9, bold: true, width: 190 });
  y += 58;

  if (data.po.revision > 0) {
    doc.roundedRect(M, y, W, 20, 3).fill(C.amberSoft);
    txt(doc, `REVISI ${data.po.revision} — dokumen ini menggantikan semua versi sebelumnya untuk ${data.po.doc}.`, M + 8, y + 6, { size: 8.5, bold: true, color: C.amber, width: W - 16 });
    y += 26;
  }
  if (!data.approved) {
    doc.roundedRect(M, y, W, 20, 3).fill(C.redSoft);
    txt(doc, "DRAFT — BELUM DISETUJUI. Bukan pesanan final; harga & jumlah masih dapat berubah.", M + 8, y + 6, { size: 8.5, bold: true, color: C.red, width: W - 16 });
    y += 26;
  }
  return y + 4;
}

/** Dua kolom info: supplier & pengiriman (tinggi menyesuaikan isi, tidak terpotong). */
function drawParties(doc: Doc, data: PoDocument, y: number) {
  const colW = (W - 12) / 2;
  const sup: Array<[string, string]> = [
    ["Nama toko / perusahaan", data.supplier.name],
    ["PIC", data.supplier.pic || "-"],
    ["WhatsApp", data.supplier.phone || "-"],
    ["Alamat", data.supplier.address || "-"],
  ];
  const del: Array<[string, string]> = [
    ["Alamat tujuan", data.delivery.address || "-"],
    ["Gudang penerima", data.delivery.warehouse],
    ["Dibutuhkan tanggal", data.neededByLabel],
    ["Catatan pengiriman", data.delivery.note || "-"],
  ];
  const labelW = 92;
  const rowH = (rows: Array<[string, string]>) => rows.reduce((h, [, v]) => h + Math.max(12, heightOf(doc, v, colW - labelW - 16, 8.5)) + 3, 0);
  const h = Math.max(rowH(sup), rowH(del)) + 28;
  const draw = (x: number, title: string, rows: Array<[string, string]>) => {
    doc.roundedRect(x, y, colW, h, 4).stroke(C.line);
    doc.rect(x, y, colW, 18).fill(C.soft);
    txt(doc, title, x + 8, y + 5, { size: 8, bold: true, color: C.red });
    let ry = y + 24;
    for (const [label, value] of rows) {
      txt(doc, label, x + 8, ry, { size: 7.5, color: C.muted, width: labelW });
      txt(doc, value, x + 8 + labelW, ry, { size: 8.5, width: colW - labelW - 16 });
      ry += Math.max(12, heightOf(doc, value, colW - labelW - 16, 8.5)) + 3;
    }
  };
  draw(M, "INFORMASI SUPPLIER", sup);
  draw(M + colW + 12, "INFORMASI PENGIRIMAN", del);
  return y + h + 14;
}

type Col = { key: string; label: string; w: number; align: "left" | "right" | "center" };

function columns(showPrices: boolean): Col[] {
  return showPrices
    ? [
        { key: "no", label: "No", w: 24, align: "center" },
        { key: "name", label: "Nama bahan / spesifikasi", w: 165, align: "left" },
        { key: "category", label: "Kategori", w: 72, align: "left" },
        { key: "qty", label: "Jumlah", w: 52, align: "right" },
        { key: "unit", label: "Satuan beli", w: 56, align: "left" },
        { key: "price", label: "Harga satuan*", w: 70, align: "right" },
        { key: "subtotal", label: "Subtotal*", w: W - 24 - 165 - 72 - 52 - 56 - 70, align: "right" },
      ]
    : [
        { key: "no", label: "No", w: 26, align: "center" },
        { key: "name", label: "Nama bahan / spesifikasi", w: 245, align: "left" },
        { key: "category", label: "Kategori", w: 96, align: "left" },
        { key: "qty", label: "Jumlah", w: 62, align: "right" },
        { key: "unit", label: "Satuan beli", w: W - 26 - 245 - 96 - 62, align: "left" },
      ];
}

function drawTableHead(doc: Doc, cols: Col[], y: number) {
  doc.rect(M, y, W, 20).fill(C.asphalt);
  let x = M;
  for (const c of cols) {
    txt(doc, c.label, x + 5, y + 6, { size: 7.5, bold: true, color: "#ffffff", width: c.w - 10, align: c.align });
    x += c.w;
  }
  return y + 20;
}

function cellText(it: PoDocument["items"][number], key: string): { main: string; sub?: string } {
  switch (key) {
    case "no":
      return { main: String(it.no) };
    case "name":
      return { main: it.name, sub: [it.spec, it.sku ? `SKU ${it.sku}` : "", it.packInfo].filter(Boolean).join(" · ") };
    case "category":
      return { main: it.category || "-" };
    case "qty":
      return { main: num(it.qty) };
    case "unit":
      return { main: it.purchaseUnit, sub: it.purchaseUnit !== it.baseUnit ? `= ${num(it.baseQty)} ${it.baseUnit}` : undefined };
    case "price":
      return { main: it.unitPrice > 0 ? rpUnit(it.unitPrice) : "-" };
    case "subtotal":
      return { main: it.subtotal > 0 ? rp(it.subtotal) : "-" };
    default:
      return { main: "" };
  }
}

function drawTable(doc: Doc, data: PoDocument, startY: number, onNewPage: () => number) {
  const cols = columns(data.showPrices);
  let y = drawTableHead(doc, cols, startY);
  data.items.forEach((it, idx) => {
    const cells = cols.map((c) => ({ c, t: cellText(it, c.key) }));
    const h =
      Math.max(
        ...cells.map(({ c, t }) => heightOf(doc, t.main, c.w - 10, 8.5, c.key === "name") + (t.sub ? heightOf(doc, t.sub, c.w - 10, 7) + 1 : 0)),
      ) + 10;
    // Baris tidak pernah terpotong: pindah halaman + ulang kepala tabel.
    if (y + h > CONTENT_BOTTOM) {
      y = drawTableHead(doc, cols, onNewPage());
    }
    if (idx % 2 === 1) doc.rect(M, y, W, h).fill(C.soft);
    let x = M;
    for (const { c, t } of cells) {
      txt(doc, t.main, x + 5, y + 5, { size: 8.5, bold: c.key === "name", width: c.w - 10, align: c.align });
      if (t.sub) {
        const mh = heightOf(doc, t.main, c.w - 10, 8.5, c.key === "name");
        txt(doc, t.sub, x + 5, y + 5 + mh + 1, { size: 7, color: C.muted, width: c.w - 10, align: c.align });
      }
      x += c.w;
    }
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.5).stroke(C.line);
    y += h;
  });
  return y;
}

function drawSummary(doc: Doc, data: PoDocument, startY: number, onNewPage: () => number) {
  const blocks: Array<{ h: number; draw: (y: number) => void }> = [];
  if (data.showPrices) {
    blocks.push({
      h: 44,
      draw: (y) => {
        const bx = M + W - 230;
        doc.roundedRect(bx, y + 6, 230, 34, 4).fillAndStroke(C.redSoft, C.red);
        txt(doc, "TOTAL ESTIMASI PEMBELIAN", bx + 10, y + 12, { size: 7.5, bold: true, color: C.red });
        txt(doc, rp(data.total), bx + 10, y + 22, { size: 12, bold: true, width: 210, align: "right" });
        txt(doc, `${data.items.length} item`, M, y + 14, { size: 8.5, color: C.muted });
        txt(doc, "* Harga = estimasi/referensi, bukan harga final. Harga final mengikuti konfirmasi supplier & invoice.", M, y + 26, { size: 7, color: C.muted, width: W - 250 });
      },
    });
  }
  const notes: Array<[string, string]> = [
    ["Catatan khusus", data.po.note || "-"],
    ["Mohon konfirmasi", "Ketersediaan barang, harga final, dan estimasi pengiriman sebelum barang dikirim. Barang diperiksa saat diterima; selisih/rusak dicatat pada penerimaan."],
    ["Pembayaran", data.paymentTerms || "Sesuai kesepakatan dengan Purchasing Garage Coffee."],
  ];
  for (const [label, value] of notes) {
    const h = heightOf(doc, value, W - 110, 8.5) + 8;
    blocks.push({
      h,
      draw: (y) => {
        txt(doc, label, M, y + 2, { size: 8, bold: true, color: C.muted, width: 100 });
        txt(doc, value, M + 110, y + 2, { size: 8.5, width: W - 110 });
      },
    });
  }
  blocks.push({
    h: 74,
    draw: (y) => {
      const colW = (W - 12) / 2;
      doc.roundedRect(M, y + 8, colW, 60, 4).stroke(C.line);
      txt(doc, "Dibuat oleh (Purchasing)", M + 8, y + 14, { size: 7.5, color: C.muted });
      txt(doc, data.createdByName, M + 8, y + 50, { size: 9, bold: true, width: colW - 16 });
      const x2 = M + colW + 12;
      doc.roundedRect(x2, y + 8, colW, 60, 4).stroke(data.approved ? C.line : C.red);
      txt(doc, "Status persetujuan", x2 + 8, y + 14, { size: 7.5, color: C.muted });
      txt(doc, data.approvalLabel, x2 + 8, y + 28, { size: 9, bold: true, color: data.approved ? C.ink : C.red, width: colW - 16 });
    },
  });
  let y = startY + 6;
  for (const b of blocks) {
    if (y + b.h > CONTENT_BOTTOM) y = onNewPage();
    b.draw(y);
    y += b.h;
  }
}

function drawFooters(doc: Doc, data: PoDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(M, FOOTER_Y - 6).lineTo(M + W, FOOTER_Y - 6).lineWidth(0.5).stroke(C.line);
    const left = `${data.company.name} · ${data.company.address || ""}`.slice(0, 110);
    txt(doc, left, M, FOOTER_Y, { size: 7, color: C.muted, width: W - 150 });
    txt(doc, `${data.po.doc}${data.po.revision > 0 ? ` R${data.po.revision}` : ""} · Hal. ${i - range.start + 1}/${range.count}`, M + W - 150, FOOTER_Y, { size: 7, color: C.muted, width: 150, align: "right" });
  }
}

/** Render PDF → { buffer, sha256 }. Sumber data = getPoDocument (sama dengan pesan WhatsApp). */
export async function renderPurchaseOrderPdf(data: PoDocument): Promise<{ buffer: Buffer; sha256: string }> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: 20, left: M, right: M },
    bufferPages: true,
    info: {
      Title: `Purchase Order ${data.po.doc}${data.po.revision > 0 ? ` Revisi ${data.po.revision}` : ""}`,
      Author: data.company.name,
      Subject: `Pesanan pembelian untuk ${data.supplier.name}`,
      Creator: "Garage OS WMS",
      // Tanggal dokumen = waktu PO (bukan waktu render) → isi sama menghasilkan sidik SHA-256 sama.
      CreationDate: new Date(data.po.approvedAt ?? data.po.createdAt),
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
    txt(doc, `PURCHASE ORDER ${data.po.doc}${data.po.revision > 0 ? ` · REVISI ${data.po.revision}` : ""} (lanjutan)`, M, 18, { size: 9, bold: true, color: C.muted });
    return 38;
  };

  let y = drawHeader(doc, data);
  y = drawParties(doc, data, y);
  y = drawTable(doc, data, y, newPage);
  drawSummary(doc, data, y, newPage);
  drawFooters(doc, data);
  doc.end();
  const buffer = await done;
  return { buffer, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}
