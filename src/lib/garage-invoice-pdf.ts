import PDFDocument from "pdfkit";

import type { OrderReceiptData } from "./garage-service";

const fmtRp = (n: number) =>
  `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
  card: "Kartu",
  ewallet: "E-Wallet",
};

const labelForMethod = (method: string) =>
  PAYMENT_LABELS[method.toLowerCase()] ?? method.toUpperCase();

const STATUS_LABELS: Record<string, string> = {
  paid: "LUNAS",
  pending_cashier: "Menunggu Kasir",
  awaiting_payment: "Menunggu Bayar",
  accepted: "Diproses",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  refunded: "Direfund",
  void: "Void",
};

export async function generateInvoicePdf(data: OrderReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 48 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const { order, outlet, cashier, items, payments } = data;

      // ─── Header ─────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111")
        .text("GARAGE COFFEE & MOTOR", 48, 48);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#666")
        .text(outlet?.name ?? "Outlet", 48, doc.y);
      if (outlet?.code) {
        doc.fillColor("#999").text(`Kode: ${outlet.code}`, 48, doc.y);
      }

      // Invoice label (right side)
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#d11a2a")
        .text("INVOICE", 400, 48, { width: 147, align: "right" });
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#111")
        .text(order.invoiceNo, 400, doc.y, { width: 147, align: "right" });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#666")
        .text(`Order: ${order.orderNo}`, 400, doc.y, {
          width: 147,
          align: "right",
        });

      doc.x = 48;
      doc.moveDown(1.5);
      doc
        .strokeColor("#d11a2a")
        .lineWidth(2)
        .moveTo(48, doc.y)
        .lineTo(547, doc.y)
        .stroke();
      doc.moveDown(0.8);

      // ─── Order info grid ────────────────────────────────
      const infoY = doc.y;
      const colWidth = 165;

      const labelStyle = (label: string) => {
        doc.font("Helvetica").fontSize(8).fillColor("#888").text(label);
      };
      const valueStyle = (value: string) => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text(value);
      };

      doc.x = 48;
      doc.y = infoY;
      labelStyle("TANGGAL");
      valueStyle(fmtDateTime(order.createdAt));
      doc.moveDown(0.3);
      labelStyle("MEJA / CHANNEL");
      valueStyle(`${order.tableLabel} · ${order.channel}`);

      doc.x = 48 + colWidth;
      doc.y = infoY;
      labelStyle("KASIR");
      valueStyle(cashier?.name ?? "—");
      doc.moveDown(0.3);
      labelStyle("STATUS");
      valueStyle(STATUS_LABELS[order.status] ?? order.status.toUpperCase());

      doc.x = 48 + colWidth * 2;
      doc.y = infoY;
      labelStyle("CUSTOMER");
      valueStyle(order.customerName ?? "Guest");
      if (order.customerPhone) {
        doc.moveDown(0.3);
        labelStyle("WHATSAPP");
        valueStyle(order.customerPhone);
      }

      doc.x = 48;
      doc.moveDown(1.5);

      if (order.customerNote) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(9)
          .fillColor("#666")
          .text(`Catatan: ${order.customerNote}`, { width: 499 });
        doc.moveDown(0.5);
      }

      // ─── Items table ────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111")
        .text("Rincian Pesanan");
      doc.moveDown(0.3);

      const drawHeader = () => {
        const hy = doc.y;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#666")
          .text("ITEM", 48, hy, { width: 280 })
          .text("QTY", 328, hy, { width: 40, align: "right" })
          .text("HARGA", 368, hy, { width: 80, align: "right" })
          .text("SUBTOTAL", 448, hy, { width: 99, align: "right" });
        doc.moveDown(0.2);
        doc
          .strokeColor("#ddd")
          .lineWidth(0.5)
          .moveTo(48, doc.y)
          .lineTo(547, doc.y)
          .stroke();
        doc.moveDown(0.3);
      };
      drawHeader();

      for (const item of items) {
        if (doc.y > 720) {
          doc.addPage();
          drawHeader();
        }
        const ry = doc.y;
        const itemLabel =
          item.variantLabel && item.variantLabel.toLowerCase() !== "regular"
            ? `${item.itemName} — ${item.variantLabel}`
            : item.itemName;
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#111")
          .text(itemLabel, 48, ry, { width: 280 })
          .text(String(item.qty), 328, ry, { width: 40, align: "right" })
          .text(fmtRp(item.unitPrice), 368, ry, { width: 80, align: "right" })
          .text(fmtRp(item.lineTotal), 448, ry, { width: 99, align: "right" });
        doc.moveDown(0.5);
      }

      doc.moveDown(0.3);
      doc
        .strokeColor("#ccc")
        .lineWidth(0.5)
        .moveTo(48, doc.y)
        .lineTo(547, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ─── Totals (right-aligned) ─────────────────────────
      const totalRows: Array<[string, string]> = [
        ["Subtotal", fmtRp(order.subtotal)],
        ["Service Charge", fmtRp(order.service)],
      ];
      if (order.tax > 0) totalRows.push(["Pajak", fmtRp(order.tax)]);
      if (order.discount > 0)
        totalRows.push(["Diskon / Promo", `- ${fmtRp(order.discount)}`]);

      for (const [label, value] of totalRows) {
        const ry = doc.y;
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#555")
          .text(label, 348, ry, { width: 100, align: "right" })
          .text(value, 448, ry, { width: 99, align: "right" });
        doc.moveDown(0.35);
      }

      doc.moveDown(0.2);
      doc
        .strokeColor("#111")
        .lineWidth(1)
        .moveTo(348, doc.y)
        .lineTo(547, doc.y)
        .stroke();
      doc.moveDown(0.3);

      const grandY = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#111")
        .text("TOTAL", 348, grandY, { width: 100, align: "right" });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#d11a2a")
        .text(fmtRp(order.total), 448, grandY, { width: 99, align: "right" });

      doc.x = 48;
      doc.moveDown(1.5);

      // ─── Payments ───────────────────────────────────────
      if (payments.length) {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#111")
          .text("Pembayaran");
        doc.moveDown(0.3);

        for (const p of payments) {
          const ry = doc.y;
          const provider = (p.metadata as { provider?: string })?.provider;
          const reference = (p.metadata as { reference?: string })?.reference;
          const label = `${labelForMethod(p.method)}${provider ? ` · ${provider}` : ""}${reference ? ` (ref: ${reference})` : ""}`;
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#111")
            .text(label, 48, ry, { width: 350 })
            .text(fmtRp(p.amount), 398, ry, { width: 149, align: "right" });
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#888")
            .text(`${fmtDateTime(p.createdAt)} · ${p.status}`, 48, doc.y);
          doc.moveDown(0.5);
        }
      }

      // ─── Footer ─────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        if (order.invoiceWebUrl) {
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#666")
            .text(`Lacak invoice: ${order.invoiceWebUrl}`, 48, 798, {
              width: 499,
              align: "center",
            });
        }
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#999")
          .text(
            `Dicetak ${new Date().toLocaleString("id-ID")} · Halaman ${i + 1} dari ${range.count}`,
            48,
            812,
            { width: 499, align: "center" },
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
