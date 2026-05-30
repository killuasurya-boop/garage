import { createRequire } from "module";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { supplierReceivingItems, supplierReceivings, suppliers, user } from "@/db/schema";
import { fail } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (
  options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

function fmtRp(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const db = getDb();
  const [receiving] = await db
    .select({
      id: supplierReceivings.id,
      code: supplierReceivings.code,
      invoiceNo: supplierReceivings.invoiceNo,
      totalAmount: supplierReceivings.totalAmount,
      note: supplierReceivings.note,
      receivedAt: supplierReceivings.receivedAt,
      supplierName: suppliers.name,
      actorName: user.name,
    })
    .from(supplierReceivings)
    .leftJoin(suppliers, eq(suppliers.id, supplierReceivings.supplierId))
    .leftJoin(user, eq(user.id, supplierReceivings.receivedBy))
    .where(eq(supplierReceivings.id, id))
    .limit(1);

  if (!receiving) {
    return fail(404, "RECEIVING_NOT_FOUND", "Receiving supplier tidak ditemukan.");
  }

  const items = await db
    .select()
    .from(supplierReceivingItems)
    .where(eq(supplierReceivingItems.receivingId, id))
    .orderBy(supplierReceivingItems.itemName);

  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(18).text("GARAGE - Bukti Barang Masuk", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`No Receiving: ${receiving.code}`);
  doc.text(`Invoice: ${receiving.invoiceNo || "-"}`);
  doc.text(`Supplier: ${receiving.supplierName || "-"}`);
  doc.text(`Diterima: ${new Date(receiving.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
  doc.text(`Petugas: ${receiving.actorName || session.data.user.name}`);
  doc.text(`Catatan: ${receiving.note || "-"}`);
  doc.moveDown();

  doc.fontSize(11).text("Item", 36, doc.y, { continued: true });
  doc.text("Qty", 300, doc.y, { width: 70, align: "right", continued: true });
  doc.text("Harga", 380, doc.y, { width: 70, align: "right", continued: true });
  doc.text("Total", 460, doc.y, { width: 80, align: "right" });
  doc.moveTo(36, doc.y + 3).lineTo(560, doc.y + 3).stroke();
  doc.moveDown(0.6);

  for (const item of items) {
    const y = doc.y;
    doc.fontSize(9).text(`${item.itemName}\n${item.itemSku || "-"}`, 36, y, { width: 245 });
    doc.text(`${item.qty} ${item.unit}`, 300, y, { width: 70, align: "right" });
    doc.text(fmtRp(item.unitCost), 380, y, { width: 70, align: "right" });
    doc.text(fmtRp(item.lineTotal), 460, y, { width: 80, align: "right" });
    doc.moveDown(1.1);
  }

  doc.moveTo(36, doc.y + 3).lineTo(560, doc.y + 3).stroke();
  doc.moveDown();
  doc.fontSize(12).text(`Total: ${fmtRp(receiving.totalAmount)}`, { align: "right" });
  doc.moveDown(2);
  doc.fontSize(10).text("Paraf Supplier: ____________________", { continued: true });
  doc.text("Paraf Gudang: ____________________", { align: "right" });
  doc.end();

  const pdf = await done;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${receiving.code}.pdf"`,
    },
  });
}
