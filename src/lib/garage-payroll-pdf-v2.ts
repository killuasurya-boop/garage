// Payroll V2 — slip gaji dengan 2 section (Wallet Gaji + Wallet Fee).
// Reuse pola pdfkit standalone dari garage-payroll-pdf.ts (yang existing).

import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

export interface PayrollSlipV2Line {
  label: string;
  amount: number;
  qty?: number | string;
}

export interface PayrollSlipV2Data {
  staffName: string;
  role: string;
  period: string; // "Juli 2026"
  outletName: string;
  // Wallet Gaji
  wageBase: PayrollSlipV2Line[];
  wageOvertime: PayrollSlipV2Line[];
  wageBonus: PayrollSlipV2Line[];
  wageDeduction: PayrollSlipV2Line[];
  wageSubtotal: number;
  // Wallet Fee
  feePool: PayrollSlipV2Line[];
  feeBonus: PayrollSlipV2Line[];
  feeSubtotal: number;
  // Total
  grandTotal: number;
  paidAt?: string | null;
  notes?: string | null;
}

function rp(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export async function generatePayrollSlipV2Pdf(data: PayrollSlipV2Data): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fontSize(16).text("SLIP GAJI & FEE — GARAGE COFFEE & MOTOR", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(9).text(`Periode: ${data.period}    Outlet: ${data.outletName}`, {
        align: "center",
      });
      doc.moveDown(1);

      // Identitas
      doc.fontSize(11).text(`Nama: ${data.staffName}`);
      doc.text(`Role: ${data.role}`);
      doc.moveDown(0.5);

      const drawSection = (title: string, groups: Array<PayrollSlipV2Line[]>, subtotal: number) => {
        doc.moveDown(0.4);
        doc.fontSize(12).text(title, { underline: true });
        doc.moveDown(0.2);
        doc.fontSize(10);
        for (const group of groups) {
          for (const line of group) {
            const qty = line.qty ? ` (${line.qty})` : "";
            doc.text(`  ${line.label}${qty}`, { continued: true });
            doc.text(rp(line.amount), { align: "right" });
          }
        }
        doc.moveDown(0.2);
        doc.fontSize(11).text(`Subtotal ${title}`, { continued: true });
        doc.text(rp(subtotal), { align: "right" });
      };

      drawSection(
        "▓ WALLET GAJI",
        [data.wageBase, data.wageOvertime, data.wageBonus, data.wageDeduction],
        data.wageSubtotal,
      );
      drawSection("▓ WALLET FEE", [data.feePool, data.feeBonus], data.feeSubtotal);

      doc.moveDown(0.8);
      doc.fontSize(14).text("TOTAL DIBAYAR", { continued: true });
      doc.text(rp(data.grandTotal), { align: "right" });

      if (data.paidAt) {
        doc.moveDown(0.5);
        doc.fontSize(9).text(`Dibayar: ${data.paidAt}`);
      }
      if (data.notes) {
        doc.moveDown(0.3);
        doc.fontSize(9).text(`Catatan: ${data.notes}`);
      }

      doc.moveDown(2);
      doc.fontSize(8).text("Slip ini digenerate otomatis oleh Garage OS.", {
        align: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
