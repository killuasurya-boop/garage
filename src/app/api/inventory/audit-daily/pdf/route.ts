import { createRequire } from "module";

import { fail } from "@/lib/api-response";
import {
  getWarehouseDailyAuditSummary,
  getWarehouseDailyReportLock,
} from "@/lib/garage-service";
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

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    const lock = date ? await getWarehouseDailyReportLock(date, session.data) : null;
    const audit = lock?.report ?? (await getWarehouseDailyAuditSummary({ date }));
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text("GARAGE - Audit Harian Gudang", { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(10).fillColor("#555").text(fmtDate(audit.date), { align: "center" });
    if (lock) {
      doc
        .fontSize(9)
        .fillColor("#166534")
        .text(
          `Dokumen: ${lock.documentNo} | Status: TERKUNCI ${new Date(lock.lockedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} oleh ${lock.lockedBy.name}`,
          { align: "center" },
        );
    }
    doc.moveDown();
    doc.fillColor("#111");

    const summaryRows = [
      ["Receiving supplier", `${audit.receivingCount} dokumen / ${fmtRp(audit.receivingValue)}`],
      ["Issue outlet", `${audit.issuedRequestCount} request / ${audit.issuedItemCount} item`],
      ["Movement", `${audit.movementCount} event`],
      ["Nilai stok Gudang", fmtRp(audit.warehouseStockValue)],
      ["Low / Watch", `${audit.lowCount} low / ${audit.watchCount} watch`],
    ];
    for (const [label, value] of summaryRows) {
      doc.fontSize(10).fillColor("#555").text(label, { continued: true });
      doc.fillColor("#111").text(`  ${value}`, { align: "right" });
      doc.moveDown(0.35);
    }

    doc.moveDown();
    doc.fontSize(13).text("Issue Per Area");
    doc.moveDown(0.3);
    if (audit.byStation.length) {
      for (const row of audit.byStation) {
        doc.fontSize(10).text(`${row.station === "bar" ? "Bar" : "Dapur"}: ${row.requestCount} request / ${row.totalQty} qty`);
      }
    } else {
      doc.fontSize(10).fillColor("#666").text("Belum ada issue outlet hari ini.");
      doc.fillColor("#111");
    }

    doc.moveDown();
    doc.fontSize(13).text("Top Mutasi");
    doc.moveDown(0.3);
    if (audit.topMovementItems.length) {
      for (const item of audit.topMovementItems) {
        doc.fontSize(10).text(`${item.name} (${item.sku}) - ${item.totalAbsQty} ${item.unit}`);
      }
    } else {
      doc.fontSize(10).fillColor("#666").text("Belum ada mutasi besar hari ini.");
      doc.fillColor("#111");
    }

    doc.moveDown();
    doc.fontSize(13).text("Movement Type");
    doc.moveDown(0.3);
    for (const row of audit.byMovementType.slice(0, 10)) {
      doc.fontSize(10).text(`${row.type}: ${row.count} event / total qty ${row.totalQty}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#555").text(`Generated: ${new Date(audit.generatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
    doc.text(`Actor: ${session.data.user.name} / ${session.data.profile.role}`);
    doc.moveDown(2);
    doc.fillColor("#111").text("Paraf Gudang: ____________________", { continued: true });
    doc.text("Paraf Owner/Admin: ____________________", { align: "right" });
    doc.end();

    const pdf = await done;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="garage-audit-gudang-${audit.date}.pdf"`,
      },
    });
  } catch (error) {
    return fail(
      500,
      "AUDIT_PDF_FAILED",
      error instanceof Error ? error.message : "PDF audit harian gagal dibuat.",
    );
  }
}
