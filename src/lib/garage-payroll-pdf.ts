import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

type PayrollPdfData = {
  name: string;
  email: string;
  role: string;
  division: string | null;
  position: string | null;
  period: string;
  baseSalary: number;
  allowance: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  status: string;
  paidAt: string | Date | null;
  notes: string | null;
  outletName: string;
};

export async function generatePayrollSlipPdf(data: PayrollPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create A4 portrait document
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const accentColor = "#c89828"; // Amber gold
      const darkColor = "#1a1d26"; // Dark slate
      const lightBg = "#f8f9fa";
      const borderColor = "#e9ecef";

      // ── HEADER SECTION ──
      doc.rect(40, 40, 515, 80).fill(darkColor);
      
      doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff").text("GARAGE COFFEE & MOTOR", 54, 56);
      doc.font("Helvetica").fontSize(9).fillColor("#a1a1aa").text(`Outlet: ${data.outletName} · Professional Café & Workshop Services`, 56, 80);
      
      // Right-aligned Title
      doc.font("Helvetica-Bold").fontSize(14).fillColor(accentColor).text("SLIP GAJI RESMI", 400, 56, { align: "right", width: 140 });
      doc.font("Helvetica").fontSize(8).fillColor("#ffffff").text(`Periode: ${data.period}`, 400, 76, { align: "right", width: 140 });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(data.status === "paid" ? "#10b981" : "#f59e0b").text(
        `STATUS: ${data.status === "paid" ? "LUNAS / DIBAYAR" : "DRAF / REVISE"}`,
        400,
        90,
        { align: "right", width: 140 }
      );

      // ── EMPLOYEE INFO SECTION ──
      doc.font("Helvetica-Bold").fontSize(10).fillColor(darkColor).text("INFORMASI KARYAWAN", 40, 140);
      doc.moveTo(40, 154).lineTo(555, 154).strokeColor(borderColor).lineWidth(1).stroke();

      // Info grid
      doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Nama Staf:", 40, 166);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(darkColor).text(data.name, 130, 166);

      doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Email:", 40, 180);
      doc.font("Helvetica").fontSize(9).fillColor(darkColor).text(data.email, 130, 180);

      doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Jabatan / Peran:", 300, 166);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(darkColor).text(`${data.position || data.role}`, 390, 166);

      doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Divisi Kerja:", 300, 180);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(
        data.division === "Bengkel Motor" ? "#2563eb" : data.division === "F&B Kafe" ? "#d97706" : darkColor
      ).text(data.division || "Umum", 390, 180);

      if (data.paidAt) {
        doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Tanggal Transfer:", 40, 194);
        doc.font("Helvetica").fontSize(9).fillColor(darkColor).text(
          new Date(data.paidAt).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric"
          }),
          130,
          194
        );
      }

      // ── FINANCIAL DETAILS BLOCK ──
      doc.font("Helvetica-Bold").fontSize(10).fillColor(darkColor).text("RINCIAN PENERIMAAN (EARNINGS)", 40, 230);
      doc.moveTo(40, 244).lineTo(555, 244).strokeColor(borderColor).lineWidth(1).stroke();

      // Earnings Table rows
      let y = 256;
      doc.font("Helvetica").fontSize(9).fillColor(darkColor).text("Gaji Pokok Dasar", 40, y);
      doc.font("Courier-Bold").fontSize(9).fillColor(darkColor).text(`Rp${data.baseSalary.toLocaleString("id-ID")}`, 450, y, { align: "right", width: 100 });

      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor(darkColor).text("Tunjangan Operasional", 40, y);
      doc.font("Courier-Bold").fontSize(9).fillColor(darkColor).text(`Rp${data.allowance.toLocaleString("id-ID")}`, 450, y, { align: "right", width: 100 });

      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor(darkColor).text("Bonus Performa & Lembur (KPI)", 40, y);
      doc.font("Courier-Bold").fontSize(9).fillColor(darkColor).text(`Rp${data.bonus.toLocaleString("id-ID")}`, 450, y, { align: "right", width: 100 });

      // Total Earnings Box
      y += 18;
      const totalEarnings = data.baseSalary + data.allowance + data.bonus;
      doc.rect(40, y, 515, 20).fill(lightBg);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(darkColor).text("TOTAL PENERIMAAN KOTOR", 50, y + 6);
      doc.font("Courier-Bold").fontSize(9).fillColor(darkColor).text(`Rp${totalEarnings.toLocaleString("id-ID")}`, 450, y + 6, { align: "right", width: 100 });

      // ── DEDUCTIONS BLOCK ──
      y += 40;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(darkColor).text("RINCIAN POTONGAN (DEDUCTIONS)", 40, y);
      doc.moveTo(40, y + 14).lineTo(555, y + 14).strokeColor(borderColor).lineWidth(1).stroke();

      y += 24;
      doc.font("Helvetica").fontSize(9).fillColor(darkColor).text("Potongan Kasbon / Pinjaman Karyawan", 40, y);
      doc.font("Courier-Bold").fontSize(9).fillColor("#ef4444").text(`Rp${data.deduction.toLocaleString("id-ID")}`, 450, y, { align: "right", width: 100 });

      // Total Deductions Box
      y += 18;
      doc.rect(40, y, 515, 20).fill(lightBg);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(darkColor).text("TOTAL POTONGAN", 50, y + 6);
      doc.font("Courier-Bold").fontSize(9).fillColor("#ef4444").text(`Rp${data.deduction.toLocaleString("id-ID")}`, 450, y + 6, { align: "right", width: 100 });

      // ── NET PAY BOX ──
      y += 40;
      doc.rect(40, y, 515, 36).fill(darkColor);
      doc.rect(40, y, 515, 36).strokeColor(accentColor).lineWidth(1).stroke();
      doc.font("Helvetica-Bold").fontSize(11).fillColor(accentColor).text("TOTAL GAJI BERSIH (NET PAY)", 54, y + 13);
      doc.font("Courier-Bold").fontSize(13).fillColor("#ffffff").text(`Rp${data.netSalary.toLocaleString("id-ID")}`, 430, y + 12, { align: "right", width: 120 });

      // ── NOTES & FOOTER ──
      if (data.notes) {
        y += 56;
        doc.font("Helvetica").fontSize(8).fillColor("#666666").text(`Catatan Slip Gaji: ${data.notes}`, 40, y, { width: 515 });
      }

      // Signatures
      y += 76;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(darkColor).text("Pihak Penanggung Jawab,", 40, y);
      doc.font("Helvetica").fontSize(8).fillColor("#666666").text("Owner / CFO Garage Coffee", 40, y + 12);
      
      doc.moveTo(40, y + 64).lineTo(150, y + 64).strokeColor("#dddddd").lineWidth(0.8).stroke();
      doc.font("Helvetica").fontSize(7).fillColor("#999999").text("Tanda Tangan & Nama Terang", 40, y + 68);

      doc.font("Helvetica-Bold").fontSize(8).fillColor(darkColor).text("Penerima Upah,", 400, y, { align: "right", width: 155 });
      doc.font("Helvetica").fontSize(8).fillColor("#666666").text("Karyawan Bersangkutan", 400, y + 12, { align: "right", width: 155 });
      
      doc.moveTo(445, y + 64).lineTo(555, y + 64).strokeColor("#dddddd").lineWidth(0.8).stroke();
      doc.font("Helvetica").fontSize(7).fillColor("#999999").text("Tanda Tangan & Nama Terang", 400, y + 68, { align: "right", width: 155 });

      // Footer Notice
      doc.font("Helvetica").fontSize(7).fillColor("#999999").text(
        "Dokumen ini dibuat secara elektronik oleh Garage Coffee & Motor OS dan sah tanpa tanda tangan basah.",
        40,
        y + 110,
        { align: "center", width: 515 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
