import { createRequire } from "module";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryTransferItems, inventoryTransferRequests, outlets } from "@/db/schema";
import { fail } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (
  options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

function stationLabel(station: string) {
  return station === "bar" ? "Bar" : "Dapur";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const { id } = await context.params;
  const db = getDb();
  const [request] = await db
    .select({
      id: inventoryTransferRequests.id,
      requestNo: inventoryTransferRequests.requestNo,
      outletName: outlets.name,
      station: inventoryTransferRequests.station,
      status: inventoryTransferRequests.status,
      note: inventoryTransferRequests.note,
      createdAt: inventoryTransferRequests.createdAt,
      approvedAt: inventoryTransferRequests.approvedAt,
      issuedAt: inventoryTransferRequests.issuedAt,
    })
    .from(inventoryTransferRequests)
    .leftJoin(outlets, eq(outlets.id, inventoryTransferRequests.outletId))
    .where(eq(inventoryTransferRequests.id, id))
    .limit(1);

  if (!request) {
    return fail(404, "TRANSFER_NOT_FOUND", "Request tidak ditemukan.");
  }

  const items = await db
    .select()
    .from(inventoryTransferItems)
    .where(eq(inventoryTransferItems.requestId, id))
    .orderBy(inventoryTransferItems.itemName);

  try {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 44 });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text("GARAGE - DOKUMEN REQUEST GUDANG", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`No: ${request.requestNo}`);
    doc.text(`Outlet: ${request.outletName ?? "Outlet"}`);
    doc.text(`Tujuan: ${stationLabel(request.station)}`);
    doc.text(`Status: ${request.status.toUpperCase()}`);
    doc.text(`Tanggal request: ${request.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
    doc.text(`Catatan: ${request.note || "-"}`);
    doc.moveDown();

    doc.fontSize(10).text("Rincian Item", { underline: true });
    doc.moveDown(0.4);
    items.forEach((item, index) => {
      const remainingQty = Math.max(0, Number((item.requestedQty - item.issuedQty).toFixed(4)));
      doc
        .fontSize(10)
        .fillColor("#000000")
        .text(`${index + 1}. ${item.itemName}`)
        .fontSize(8)
        .fillColor("#555555")
        .text(`   ${item.itemSku ?? "-"}`)
        .fontSize(9)
        .fillColor("#000000")
        .text(
          `   Request: ${item.requestedQty} ${item.unit} | Issue: ${item.issuedQty} ${item.unit} | Sisa: ${remainingQty} ${item.unit}`,
        );
      doc.moveDown(0.25);
    });

    doc.moveDown();
    doc.fontSize(10).text(`Total item: ${items.length}`);
    doc.moveDown(1.2);
    doc.text("Paraf Gudang: ____________________", { continued: true });
    doc.text(`   Paraf ${stationLabel(request.station)}: ____________________`);
    doc.end();

    const pdf = await done;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${request.requestNo}.pdf"`,
      },
    });
  } catch (error) {
    return fail(
      500,
      "TRANSFER_PDF_FAILED",
      error instanceof Error ? error.message : "PDF request Gudang gagal dibuat.",
    );
  }
}
