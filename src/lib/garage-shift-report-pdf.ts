import { createRequire } from "module";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (
  options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

type Summary = NonNullable<
  Awaited<ReturnType<typeof import("./garage-service").getCashSessionSummary>>
>;
type Transactions = NonNullable<
  Awaited<ReturnType<typeof import("./garage-service").getCashSessionTransactions>>
>;

const fmtRp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })
    : "—";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
  card: "Kartu",
  ewallet: "E-Wallet",
};

const MOVEMENT_STATUS: Record<string, string> = {
  recorded: "Tercatat",
  pending_approval: "Pending",
  rejected: "Ditolak",
  voided: "Dibatalkan",
};

const labelForMethod = (method: string) =>
  PAYMENT_LABELS[method.toLowerCase()] ?? method.toUpperCase();

export async function generateShiftReportPdf(
  summary: Summary,
  transactions: Transactions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const { session } = summary;

      // ─── Header ─────────────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111")
        .text("GARAGE COFFEE", { align: "left" });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text(`Outlet: ${session.outletCode ?? "-"}`, { align: "left" });
      doc.moveDown(0.5);

      doc
        .strokeColor("#d11a2a")
        .lineWidth(2)
        .moveTo(48, doc.y)
        .lineTo(547, doc.y)
        .stroke();

      doc.moveDown(0.8);
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#111")
        .text("Laporan Penutupan Shift Kasir", { align: "left" });
      doc.moveDown(0.5);

      // ─── Shift info ─────────────────────────────────────
      const labelStyle = (label: string) => {
        doc.font("Helvetica").fontSize(9).fillColor("#666").text(label, { continued: false });
      };
      const valueStyle = (value: string) => {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text(value);
      };

      const startY = doc.y;
      const colWidth = 165;

      // Column 1
      doc.x = 48;
      doc.y = startY;
      labelStyle("KODE SESI");
      valueStyle(session.code);
      doc.moveDown(0.3);
      labelStyle("KASIR");
      valueStyle(session.openedByName ?? "—");

      // Column 2
      doc.x = 48 + colWidth;
      doc.y = startY;
      labelStyle("BUKA");
      valueStyle(fmtDateTime(session.openedAt));
      doc.moveDown(0.3);
      labelStyle("TUTUP");
      valueStyle(fmtDateTime(session.closedAt));

      // Column 3
      doc.x = 48 + colWidth * 2;
      doc.y = startY;
      labelStyle("STATUS");
      valueStyle(session.status.toUpperCase());
      doc.moveDown(0.3);
      labelStyle("DITUTUP OLEH");
      valueStyle(session.closedByName ?? "—");

      // Reset x
      doc.x = 48;
      doc.moveDown(1);

      // ─── Summary box: cash ──────────────────────────────
      const drawCashBox = () => {
        const boxY = doc.y;
        const boxHeight = 90;
        doc
          .roundedRect(48, boxY, 499, boxHeight, 6)
          .fillAndStroke("#f5f5f5", "#ddd");
        doc.fillColor("#111");

        const rows: Array<[string, string]> = [
          ["Modal Awal", fmtRp(session.openingCash)],
          ["Kas Diharapkan", fmtRp(session.expectedCash)],
          [
            "Kas Aktual",
            session.actualCash != null ? fmtRp(session.actualCash) : "Belum dihitung",
          ],
          [
            "Selisih",
            session.actualCash != null
              ? `${session.discrepancy >= 0 ? "+" : ""}${fmtRp(session.discrepancy)}`
              : "—",
          ],
        ];

        const rowHeight = 18;
        rows.forEach(([label, value], i) => {
          const rowY = boxY + 10 + i * rowHeight;
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#555")
            .text(label, 60, rowY, { width: 200 });
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor(
              label === "Selisih" && session.actualCash != null && session.discrepancy !== 0
                ? session.discrepancy < 0
                  ? "#d11a2a"
                  : "#22c55e"
                : "#111",
            )
            .text(value, 280, rowY, { width: 250, align: "right" });
        });

        doc.y = boxY + boxHeight + 10;
      };
      drawCashBox();

      // ─── Sales summary ──────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#111")
        .text("Ringkasan Penjualan", 48, doc.y);
      doc.moveDown(0.3);

      const salesRows: Array<[string, string]> = [
        ["Total Order", String(summary.counts.total)],
        ["Order Lunas", String(summary.counts.paid)],
        ["Refund / Void", String(summary.counts.refunded)],
        ["Subtotal", fmtRp(summary.sales.subtotal)],
        ["Service Charge", fmtRp(summary.sales.service)],
        ["Pajak", fmtRp(summary.sales.tax)],
        ["Diskon / Promo", `- ${fmtRp(summary.sales.discount)}`],
      ];

      salesRows.forEach(([label, value]) => {
        const rowY = doc.y;
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#555")
          .text(label, 48, rowY, { width: 250 });
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#111")
          .text(value, 298, rowY, { width: 249, align: "right" });
        doc.moveDown(0.4);
      });

      doc.moveDown(0.2);
      const grossY = doc.y;
      doc
        .strokeColor("#111")
        .lineWidth(1)
        .moveTo(48, grossY)
        .lineTo(547, grossY)
        .stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111");
      const totalY = doc.y;
      doc.text("TOTAL PENJUALAN", 48, totalY, { width: 250 });
      doc.text(fmtRp(summary.sales.gross), 298, totalY, {
        width: 249,
        align: "right",
      });
      doc.moveDown(1);

      // ─── Breakdown by payment method ────────────────────
      if (summary.byMethod.length) {
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#111")
          .text("Rincian Metode Pembayaran", 48, doc.y);
        doc.moveDown(0.3);

        // Header row
        const drawMethodHeader = () => {
          const hy = doc.y;
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#666")
            .text("METODE", 48, hy, { width: 200 })
            .text("JUMLAH", 248, hy, { width: 100, align: "right" })
            .text("TOTAL", 348, hy, { width: 199, align: "right" });
          doc.moveDown(0.2);
          doc
            .strokeColor("#ddd")
            .lineWidth(0.5)
            .moveTo(48, doc.y)
            .lineTo(547, doc.y)
            .stroke();
          doc.moveDown(0.2);
        };
        drawMethodHeader();

        for (const m of summary.byMethod) {
          if (doc.y > 770) doc.addPage();
          const ry = doc.y;
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#111")
            .text(labelForMethod(m.method), 48, ry, { width: 200 })
            .text(String(m.count), 248, ry, { width: 100, align: "right" })
            .text(fmtRp(m.total), 348, ry, { width: 199, align: "right" });
          doc.moveDown(0.4);
        }
        doc.moveDown(0.5);
      }

      // ─── Kas masuk / keluar laci + rekonsiliasi ─────────
      const sectionTitle = (title: string) => {
        if (doc.y > 700) doc.addPage();
        doc.x = 48;
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#111").text(title, 48, doc.y);
        doc.moveDown(0.3);
      };
      const pairRow = (label: string, value: string, options: { bold?: boolean; color?: string } = {}) => {
        if (doc.y > 770) doc.addPage();
        const ry = doc.y;
        doc
          .font(options.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10)
          .fillColor("#555")
          .text(label, 48, ry, { width: 300 });
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(options.color ?? "#111")
          .text(value, 348, ry, { width: 199, align: "right" });
        doc.moveDown(0.35);
      };
      const rule = () => {
        doc.strokeColor("#ddd").lineWidth(0.5).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
        doc.moveDown(0.25);
      };

      const recon = summary.reconciliation;
      sectionTitle("Rekonsiliasi Kas Laci");
      pairRow("Modal awal", fmtRp(recon.openingCash));
      pairRow("+ Penerimaan tunai penjualan", fmtRp(recon.cashSales));
      pairRow("+ Kas masuk laci (tercatat)", fmtRp(recon.cashIn));
      pairRow("- Kas keluar laci (tercatat)", `- ${fmtRp(recon.cashOut)}`);
      if (recon.otherAdjustments !== 0) {
        pairRow(
          "± Penyesuaian lain (refund/void tunai, pengeluaran Finance tunai)",
          `${recon.otherAdjustments < 0 ? "- " : "+ "}${fmtRp(Math.abs(recon.otherAdjustments))}`,
        );
      }
      rule();
      pairRow("= Kas akhir yang diharapkan", fmtRp(recon.expectedCash), { bold: true });
      pairRow("Kas aktual (dihitung)", session.actualCash != null ? fmtRp(session.actualCash) : "Belum dihitung");
      if (session.actualCash != null) {
        pairRow("Selisih", `${session.discrepancy >= 0 ? "+" : ""}${fmtRp(session.discrepancy)}`, {
          color: session.discrepancy === 0 ? "#111" : session.discrepancy < 0 ? "#d11a2a" : "#15803d",
        });
      }
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor("#666")
        .text(
          "QRIS/transfer tidak masuk laci fisik. Kas masuk bukan penjualan; kasbon, refund, setoran & brankas bukan biaya operasional.",
          48,
          doc.y,
          { width: 499 },
        );
      doc.moveDown(0.8);

      const movements = summary.movements;
      sectionTitle("Kas Masuk / Keluar Laci");
      if (!movements.length) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor("#666")
          .text("Tidak ada kas masuk/keluar laci yang dicatat di shift ini.", 48, doc.y);
        doc.moveDown(0.8);
      } else {
        pairRow("Total kas masuk", fmtRp(summary.cashMovements.cashIn));
        pairRow("Total kas keluar", `- ${fmtRp(summary.cashMovements.cashOut)}`);
        if (summary.cashMovements.pendingCount) {
          pairRow(
            `Pengajuan pending (${summary.cashMovements.pendingCount}) — uang belum bergerak`,
            fmtRp(summary.cashMovements.pendingAmount),
            { color: "#b45309" },
          );
        }
        doc.moveDown(0.3);

        if (summary.cashMovements.byGroup.length) {
          if (doc.y > 740) doc.addPage();
          const gy = doc.y;
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#666")
            .text("KELOMPOK", 48, gy, { width: 200 })
            .text("TRX", 248, gy, { width: 50, align: "right" })
            .text("MASUK", 300, gy, { width: 120, align: "right" })
            .text("KELUAR", 422, gy, { width: 125, align: "right" });
          doc.moveDown(0.2);
          rule();
          for (const group of summary.cashMovements.byGroup) {
            if (doc.y > 770) doc.addPage();
            const ry = doc.y;
            doc
              .font("Helvetica")
              .fontSize(10)
              .fillColor("#111")
              .text(group.label, 48, ry, { width: 200 })
              .text(String(group.count), 248, ry, { width: 50, align: "right" })
              .text(group.cashIn ? fmtRp(group.cashIn) : "-", 300, ry, { width: 120, align: "right" })
              .text(group.cashOut ? fmtRp(group.cashOut) : "-", 422, ry, { width: 125, align: "right" });
            doc.moveDown(0.35);
          }
          doc.moveDown(0.5);
        }

        // Rincian per transaksi (termasuk pending/ditolak/dibatalkan untuk audit).
        const cols = {
          time: { x: 48, w: 70 },
          kind: { x: 120, w: 84 },
          desc: { x: 206, w: 142 },
          who: { x: 350, w: 66 },
          amount: { x: 418, w: 60 },
          balance: { x: 480, w: 67 },
        };
        const drawMovementHeader = () => {
          const hy = doc.y;
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#666")
            .text("WAKTU / REF", cols.time.x, hy, { width: cols.time.w })
            .text("JENIS / KATEGORI", cols.kind.x, hy, { width: cols.kind.w })
            .text("KETERANGAN", cols.desc.x, hy, { width: cols.desc.w })
            .text("PETUGAS", cols.who.x, hy, { width: cols.who.w })
            .text("NOMINAL", cols.amount.x, hy, { width: cols.amount.w, align: "right" })
            .text("SALDO LACI", cols.balance.x, hy, { width: cols.balance.w, align: "right" });
          doc.moveDown(0.2);
          rule();
        };
        if (doc.y > 680) doc.addPage();
        drawMovementHeader();
        for (const m of movements) {
          const timeText = `${fmtTime(m.movementAt)}\n${m.refNo ?? "-"}`;
          const kindText = `${m.type === "out" ? "KELUAR" : "MASUK"} · ${MOVEMENT_STATUS[m.status] ?? m.status}\n${m.category}`;
          const descText = [
            m.description,
            m.counterparty ? `Pihak: ${m.counterparty}` : null,
            m.vendorName ? `Toko: ${m.vendorName}` : null,
            m.receiptNo ? `Nota: ${m.receiptNo}` : null,
            m.orderNo ? `Order: ${m.orderNo}` : null,
            m.note ? `Catatan: ${m.note}` : null,
            m.status === "rejected" && m.decisionNote ? `Alasan tolak: ${m.decisionNote}` : null,
            m.status === "voided" && m.voidReason ? `Alasan batal: ${m.voidReason}` : null,
          ]
            .filter(Boolean)
            .join("\n");
          const whoText = [m.createdByName ?? "-", m.approvedByName ? `Setuju: ${m.approvedByName}` : null]
            .filter(Boolean)
            .join("\n");
          const amountText = `${m.type === "out" ? "-" : "+"}${fmtRp(m.amount)}`;
          const balanceText =
            m.balanceBefore != null && m.balanceAfter != null
              ? `${fmtRp(m.balanceBefore)}\n-> ${fmtRp(m.balanceAfter)}`
              : "-";
          doc.font("Helvetica").fontSize(8);
          const rowHeight = Math.max(
            doc.heightOfString(timeText, { width: cols.time.w }),
            doc.heightOfString(kindText, { width: cols.kind.w }),
            doc.heightOfString(descText, { width: cols.desc.w }),
            doc.heightOfString(whoText, { width: cols.who.w }),
            doc.heightOfString(balanceText, { width: cols.balance.w }),
          );
          if (doc.y + rowHeight > 790) {
            doc.addPage();
            drawMovementHeader();
          }
          const ry = doc.y;
          const muted = m.status !== "recorded";
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(muted ? "#888" : "#111")
            .text(timeText, cols.time.x, ry, { width: cols.time.w })
            .text(kindText, cols.kind.x, ry, { width: cols.kind.w })
            .text(descText, cols.desc.x, ry, { width: cols.desc.w })
            .text(whoText, cols.who.x, ry, { width: cols.who.w })
            .text(balanceText, cols.balance.x, ry, { width: cols.balance.w, align: "right" });
          doc
            .font("Helvetica-Bold")
            .fillColor(muted ? "#888" : m.type === "out" ? "#d11a2a" : "#111")
            .text(amountText, cols.amount.x, ry, { width: cols.amount.w, align: "right" });
          doc.y = ry + rowHeight + 4;
          doc.strokeColor("#eee").lineWidth(0.5).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
          doc.y += 4;
        }
        doc.x = 48;
        doc.moveDown(0.8);
      }

      // ─── Transaction detail ─────────────────────────────
      if (transactions.orders.length) {
        // Force new page if not enough space
        if (doc.y > 650) doc.addPage();

        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#111")
          .text("Daftar Transaksi");
        doc.moveDown(0.3);

        const drawTxnHeader = () => {
          const hy = doc.y;
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#666")
            .text("WAKTU", 48, hy, { width: 50 })
            .text("ORDER", 100, hy, { width: 100 })
            .text("MEJA", 202, hy, { width: 60 })
            .text("CHANNEL", 264, hy, { width: 70 })
            .text("STATUS", 336, hy, { width: 65 })
            .text("TOTAL", 403, hy, { width: 144, align: "right" });
          doc.moveDown(0.2);
          doc
            .strokeColor("#ddd")
            .lineWidth(0.5)
            .moveTo(48, doc.y)
            .lineTo(547, doc.y)
            .stroke();
          doc.moveDown(0.2);
        };
        drawTxnHeader();

        for (const o of transactions.orders) {
          if (doc.y > 760) {
            doc.addPage();
            drawTxnHeader();
          }
          const ry = doc.y;
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#111")
            .text(fmtTime(o.createdAt), 48, ry, { width: 50 })
            .text(o.orderNo, 100, ry, { width: 100 })
            .text(o.tableLabel, 202, ry, { width: 60 })
            .text(o.channel, 264, ry, { width: 70 })
            .text(o.status.toUpperCase(), 336, ry, { width: 65 })
            .text(fmtRp(o.total), 403, ry, { width: 144, align: "right" });
          doc.moveDown(0.4);
        }
      } else {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor("#666")
          .text("Tidak ada transaksi pada sesi ini.");
      }

      // ─── Footer ─────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        // Footer di bawah margin: tanpa ini PDFKit membuat halaman kosong baru.
        doc.page.margins.bottom = 0;
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#888")
          .text(
            `Dicetak ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · Halaman ${i + 1} dari ${range.count}`,
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
