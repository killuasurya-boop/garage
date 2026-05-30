import { createRequire } from "module";

import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (
  options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

const previewSchema = z.object({
  station: z.enum(["bar", "dapur"]),
  outletName: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        name: z.string().trim().min(1),
        qty: z.number().positive(),
        unit: z.string().trim().min(1),
        available: z.number().nonnegative(),
      }),
    )
    .min(1),
});

function stationLabel(station: "bar" | "dapur") {
  return station === "bar" ? "Bar" : "Dapur";
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const body = await readJson(request, previewSchema);
  if (body.error) return body.error;

  try {
    const payload = body.data;
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 44 });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text("GARAGE - REQUEST GUDANG", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Tujuan: ${stationLabel(payload.station)}`);
    doc.text(`Outlet: ${payload.outletName ?? session.data.profile.outlet.name}`);
    doc.text(`Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
    doc.text(`Dibuat oleh: ${session.data.user.name}`);
    doc.text(`Catatan: ${payload.note || "-"}`);
    doc.moveDown();

    doc.fontSize(10).text("Item Request", { underline: true });
    doc.moveDown(0.4);
    payload.items.forEach((item, index) => {
      doc
        .fontSize(10)
        .text(`${index + 1}. ${item.name}`, { continued: false })
        .fontSize(8)
        .fillColor("#555555")
        .text(`   ${item.sku}`)
        .fillColor("#000000")
        .fontSize(9)
        .text(`   Request: ${item.qty} ${item.unit} | Stok Gudang: ${item.available} ${item.unit}`);
      doc.moveDown(0.25);
    });

    doc.moveDown();
    doc.fontSize(10).text(`Total item: ${payload.items.length}`);
    doc.moveDown(1.2);
    doc.text("Paraf Gudang: ____________________", { continued: true });
    doc.text(`   Paraf ${stationLabel(payload.station)}: ____________________`);
    doc.end();

    const pdf = await done;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="garage-request-${payload.station}.pdf"`,
      },
    });
  } catch (error) {
    return fail(
      500,
      "TRANSFER_PREVIEW_PDF_FAILED",
      error instanceof Error ? error.message : "PDF request Gudang gagal dibuat.",
    );
  }
}
