import { createRequire } from "module";

import { exportWmsProductsWorkbook, getWmsProducts } from "@/lib/wms-service";
import { currency } from "@/lib/garage-data";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);
type PDFDocConstructor = new (opts?: Record<string, unknown>) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocConstructor;

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function buildPdf(): Promise<Buffer> {
  const products = await getWmsProducts();
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.font("Helvetica-Bold").fontSize(16).fillColor("#C8102E").text("GARAGE — Daftar Produk Gudang");
      doc.font("Helvetica").fontSize(9).fillColor("#666").text(new Date().toLocaleString("id-ID"));
      doc.moveDown(0.4);
      doc.strokeColor("#C8102E").lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);

      const cols = [
        { t: "SKU", x: 40, w: 70 },
        { t: "Nama", x: 110, w: 150 },
        { t: "Kategori", x: 260, w: 95 },
        { t: "Satuan", x: 355, w: 45 },
        { t: "Stok", x: 400, w: 55 },
        { t: "HPP", x: 455, w: 100 },
      ];
      const header = () => {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111");
        cols.forEach((c) => doc.text(c.t, c.x, doc.y, { width: c.w, continued: false, lineBreak: false }));
        doc.moveDown(0.3);
        doc.strokeColor("#ccc").lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.2);
      };
      header();
      doc.font("Helvetica").fontSize(8.5).fillColor("#222");
      for (const p of products) {
        if (doc.y > 780) { doc.addPage(); header(); doc.font("Helvetica").fontSize(8.5).fillColor("#222"); }
        const y = doc.y;
        doc.text(p.sku, cols[0].x, y, { width: cols[0].w, lineBreak: false });
        doc.text(p.name, cols[1].x, y, { width: cols[1].w, lineBreak: false });
        doc.text(p.category, cols[2].x, y, { width: cols[2].w, lineBreak: false });
        doc.text(p.unit, cols[3].x, y, { width: cols[3].w, lineBreak: false });
        doc.text(String(p.onHand), cols[4].x, y, { width: cols[4].w, lineBreak: false });
        doc.text(currency.format(Math.round(p.hpp)), cols[5].x, y, { width: cols[5].w, lineBreak: false });
        doc.moveDown(0.5);
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const template = url.searchParams.get("template") === "1";

  if (format === "pdf") {
    const buffer = await buildPdf();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="produk-wms-${today()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await exportWmsProductsWorkbook({ template });
  const name = template ? "template-produk-wms" : `produk-wms-${today()}`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
