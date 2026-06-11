import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import type { OwnerReportData } from "@/lib/garage-owner-report";

// Laporan Owner Gabungan — PDF A4. Mengikuti gaya kop gelap + aksen amber
// yang dipakai garage-payroll-pdf.ts / garage-invoice-pdf.ts.

const ACCENT = "#c89828"; // amber gold
const DARK = "#1a1d26"; // dark slate
const LIGHT_BG = "#f8f9fa";
const BORDER = "#e9ecef";
const MUTED = "#6b7280";
const DANGER = "#b91c1c";
const WARN = "#b45309";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateLabel = (dateText: string): string => {
  const d = new Date(`${dateText}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
};

export async function generateOwnerReportPdf(
  data: OwnerReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 40;
      const width = 515;

      // ── HEADER ──
      doc.rect(left, 40, width, 80).fill(DARK);
      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor("#ffffff")
        .text("GARAGE COFFEE & MOTOR", left + 14, 56);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#a1a1aa")
        .text("Laporan Owner Harian · Ringkasan Operasional", left + 16, 80);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(ACCENT)
        .text(dateLabel(data.dateText), left + 16, 96);

      let y = 140;

      // ── HEADLINE ──
      doc.rect(left, y, width, 44).fill(LIGHT_BG);
      doc.rect(left, y, 4, 44).fill(ACCENT);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(DARK)
        .text(data.headline, left + 14, y + 8, { width: width - 28 });
      y += 60;

      // helper: section title
      const section = (title: string) => {
        if (y > 720) {
          doc.addPage();
          y = 40;
        }
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(DARK)
          .text(title.toUpperCase(), left, y);
        y += 6;
        doc
          .moveTo(left, y + 8)
          .lineTo(left + width, y + 8)
          .strokeColor(BORDER)
          .lineWidth(1)
          .stroke();
        y += 18;
      };

      // ── P&L RINGKAS ──
      section("Profit & Loss Harian");
      const pnlRows: Array<[string, string, string?]> = [
        ["Revenue (order lunas)", idr.format(data.pnl.revenue)],
        ["Jumlah order", `${data.pnl.orderCount}`],
        ["Rata-rata / order", idr.format(data.pnl.avgOrderValue)],
        ["Pengeluaran", `- ${idr.format(data.pnl.expenses)}`],
        [
          "Net harian",
          idr.format(data.pnl.net),
          data.pnl.net < 0 ? "danger" : undefined,
        ],
      ];
      for (const [label, value, flag] of pnlRows) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor(MUTED)
          .text(label, left + 4, y, { width: 280, continued: false });
        doc
          .font(label === "Net harian" ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10)
          .fillColor(flag === "danger" ? DANGER : DARK)
          .text(value, left + 290, y, { width: width - 290, align: "right" });
        y += 18;
      }
      y += 10;

      // ── TOP ITEM ──
      section("Top Item Terjual");
      if (data.topItems.length === 0) {
        doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Belum ada penjualan.", left + 4, y);
        y += 18;
      } else {
        // header row
        doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
        doc.text("Item", left + 4, y, { width: 250 });
        doc.text("Qty", left + 260, y, { width: 60, align: "right" });
        doc.text("Omzet", left + 330, y, { width: width - 330, align: "right" });
        y += 16;
        for (const it of data.topItems) {
          if (y > 760) {
            doc.addPage();
            y = 40;
          }
          const name = it.variantLabel && it.variantLabel !== "Default"
            ? `${it.itemName} (${it.variantLabel})`
            : it.itemName;
          doc.font("Helvetica").fontSize(9).fillColor(DARK);
          doc.text(name, left + 4, y, { width: 250 });
          doc.text(`${it.qty}`, left + 260, y, { width: 60, align: "right" });
          doc.text(idr.format(it.revenue), left + 330, y, {
            width: width - 330,
            align: "right",
          });
          y += 15;
        }
      }
      y += 12;

      // ── KEHADIRAN (LABOR) ──
      section("Kehadiran Staf");
      doc.font("Helvetica").fontSize(10).fillColor(DARK);
      doc.text(
        `Hadir ${data.attendance.present}/${data.attendance.totalStaff}  ·  Telat ${data.attendance.lateIn}  ·  Belum punch ${data.attendance.absent}`,
        left + 4,
        y,
      );
      y += 24;

      // ── STOK RENDAH ──
      section("Stok Rendah");
      if (data.lowStock.length === 0) {
        doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Tidak ada item stok rendah.", left + 4, y);
        y += 18;
      } else {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
        doc.text("SKU", left + 4, y, { width: 90 });
        doc.text("Nama", left + 100, y, { width: 250 });
        doc.text("On hand / Min", left + 350, y, { width: width - 350, align: "right" });
        y += 16;
        for (const it of data.lowStock) {
          if (y > 760) {
            doc.addPage();
            y = 40;
          }
          doc.font("Helvetica").fontSize(9).fillColor(DARK);
          doc.text(it.sku, left + 4, y, { width: 90 });
          doc.text(it.name, left + 100, y, { width: 250 });
          doc.fillColor(WARN).text(
            `${it.onHand} / ${it.min} ${it.unit}`,
            left + 350,
            y,
            { width: width - 350, align: "right" },
          );
          y += 15;
        }
      }
      y += 12;

      // ── TIKET DAPUR TELAT ──
      section("Tiket Dapur Telat");
      if (data.kitchen.lateList.length === 0) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(MUTED)
          .text(
            `${data.kitchen.activeTickets} tiket aktif, tidak ada yang telat.`,
            left + 4,
            y,
          );
        y += 18;
      } else {
        for (const t of data.kitchen.lateList) {
          if (y > 760) {
            doc.addPage();
            y = 40;
          }
          doc.font("Helvetica").fontSize(9).fillColor(DARK);
          doc.text(
            `#${t.ticketNo} · ${t.station} · ${t.tableLabel || "-"} · ${t.status}`,
            left + 4,
            y,
            { width: 350 },
          );
          doc.fillColor(DANGER).text(`+${t.overBy} mnt`, left + 360, y, {
            width: width - 360,
            align: "right",
          });
          y += 15;
        }
      }
      y += 12;

      // ── ACTION PRIORITAS ──
      section("Action Prioritas");
      if (data.recommendedActions.length === 0) {
        doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Tidak ada aksi mendesak. ✓", left + 4, y);
        y += 18;
      } else {
        for (const a of data.recommendedActions) {
          if (y > 770) {
            doc.addPage();
            y = 40;
          }
          const color =
            a.severity === "danger" ? DANGER : a.severity === "warn" ? WARN : MUTED;
          doc.font("Helvetica-Bold").fontSize(9).fillColor(color).text("•", left + 4, y, { width: 12 });
          doc.font("Helvetica").fontSize(9).fillColor(DARK).text(a.label, left + 18, y, { width: width - 18 });
          y += 16;
        }
      }

      // ── FOOTER ──
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Dibuat otomatis ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(data.generatedAt))} · Garage OS`,
          left,
          800,
          { width, align: "center" },
        );

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
