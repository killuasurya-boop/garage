// Payroll V2 — render slip gaji A4 (pdfkit). Satu atau banyak slip dalam satu PDF;
// tiap slip: halaman ringkasan + lampiran rincian kehadiran.
// Catatan font: Helvetica standar (WinAnsi) — hindari simbol di luar WinAnsi
// seperti "≥"; "×", "÷", "·", "—" aman.

import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import type { Payslip, PayslipLine } from "@/lib/garage-payslip";
import { terbilangRupiah } from "@/lib/terbilang";

type Doc = InstanceType<typeof PDFDocument>;

const M = 40; // margin
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 30;
const CONTENT_BOTTOM = PAGE_H - 52;

const C = {
  ink: "#1a1a1a",
  muted: "#5b5b63",
  line: "#d9d9de",
  soft: "#f4f4f6",
  red: "#c41a1a",
  redSoft: "#fdf1f1",
  amber: "#9a4d06",
  amberSoft: "#fff4e5",
};

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const num = (n: number) => new Intl.NumberFormat("id-ID").format(n);

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : "-";

const dayLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

// Path (bukan Buffer): pdfkit menyimpan gambar per path sekali per dokumen,
// jadi logo tidak tertanam ulang di setiap halaman.
let logoPath: string | null | undefined;
function loadLogo(): string | null {
  if (logoPath !== undefined) return logoPath;
  const p = path.join(process.cwd(), "public", "garage-brand", "logo-website.png");
  logoPath = fs.existsSync(p) ? p : null;
  return logoPath;
}

function txt(
  doc: Doc,
  value: string,
  x: number,
  y: number,
  o: { w?: number; size?: number; bold?: boolean; italic?: boolean; color?: string; align?: "left" | "right" | "center" } = {},
) {
  doc
    .font(o.bold ? "Helvetica-Bold" : o.italic ? "Helvetica-Oblique" : "Helvetica")
    .fontSize(o.size ?? 9.5)
    .fillColor(o.color ?? C.ink)
    .text(value, x, y, { width: o.w, align: o.align ?? "left", lineBreak: Boolean(o.w) });
}

function hline(doc: Doc, y: number, color = C.line, width = 0.7, x1 = M, x2 = M + W) {
  doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function box(doc: Doc, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
  doc.save().rect(x, y, w, h).fill(fill);
  if (stroke) doc.rect(x, y, w, h).lineWidth(0.8).stroke(stroke);
  doc.restore();
}

function header(doc: Doc, slip: Payslip, title: string): number {
  const logo = loadLogo();
  if (logo) {
    doc.image(logo, M, 34, { fit: [150, 47] });
  } else {
    txt(doc, slip.company.name.toUpperCase(), M, 44, { size: 15, bold: true });
  }
  const rx = M + W - 240;
  txt(doc, title, rx, 36, { w: 240, size: 18, bold: true, color: C.red, align: "right" });
  txt(doc, `No. ${slip.slipNo}`, rx, 60, { w: 240, size: 9, color: C.muted, align: "right" });
  txt(doc, `Periode ${slip.periodLabel}`, rx, 72, { w: 240, size: 10, bold: true, align: "right" });

  const sub = [slip.company.name, slip.company.outletName, slip.company.headerNote].filter(Boolean).join("  ·  ");
  txt(doc, sub, M, 92, { w: W, size: 8.5, color: C.muted });
  doc.save().rect(M, 106, W, 2).fill(C.red).restore();
  return 118;
}

function statsRow(doc: Doc, y: number, slip: Payslip): number {
  const a = slip.attendance;
  const stats: Array<[string, string, string]> = [
    ["Hari kerja", num(a.workingDays), slip.provisional ? "sampai kemarin" : "dalam periode"],
    ["Hadir", num(a.presentDays), "hari"],
    ["Telat", `${a.lateDays} hari`, `${a.lateMinutes} menit`],
    ["Hangus", num(a.forfeitedDays), "hari"],
    [
      "Tidak hadir",
      num(a.absentDays),
      a.leaveDays > 0 ? `jatah ${a.allowedOffDays} · izin ${a.leaveDays}` : `jatah libur ${a.allowedOffDays}`,
    ],
    ["Lembur", `${a.overtimeHours} jam`, `${a.overtimeMinutes} menit tercatat`],
  ];
  const gap = 6;
  const bw = (W - gap * (stats.length - 1)) / stats.length;
  stats.forEach(([label, value, sub], i) => {
    const x = M + i * (bw + gap);
    box(doc, x, y, bw, 50, C.soft, C.line);
    txt(doc, label.toUpperCase(), x + 7, y + 7, { w: bw - 14, size: 7, bold: true, color: C.muted });
    txt(doc, value, x + 7, y + 18, { w: bw - 14, size: 13, bold: true });
    txt(doc, sub, x + 7, y + 36, { w: bw - 14, size: 7, color: C.muted });
  });
  return y + 62;
}

const COLS = { label: M + 10, detail: M + 185, amountRight: M + W - 10, amountW: 130 };

function tableSection(doc: Doc, y: number, title: string, lines: PayslipLine[], total: number, totalLabel: string, negative: boolean): number {
  box(doc, M, y, W, 20, C.soft);
  txt(doc, title, COLS.label, y + 6, { size: 8.5, bold: true, color: C.muted });
  y += 20;
  if (lines.length === 0) {
    txt(doc, "Tidak ada", COLS.label, y + 6, { size: 9.5, italic: true, color: C.muted });
    y += 22;
  }
  for (const l of lines) {
    txt(doc, l.label, COLS.label, y + 6, { w: 170, size: 9.5 });
    txt(doc, l.detail, COLS.detail, y + 6, { w: 190, size: 8.5, color: C.muted });
    txt(doc, `${negative && l.amount > 0 ? "- " : ""}${rp(l.amount)}`, COLS.amountRight - COLS.amountW, y + 6, {
      w: COLS.amountW,
      size: 9.5,
      align: "right",
    });
    y += 22;
    hline(doc, y);
  }
  txt(doc, totalLabel, COLS.label, y + 6, { size: 9.5, bold: true });
  txt(doc, `${negative && total > 0 ? "- " : ""}${rp(total)}`, COLS.amountRight - COLS.amountW, y + 6, {
    w: COLS.amountW,
    size: 9.5,
    bold: true,
    align: "right",
  });
  return y + 26;
}

const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

const PAYMENT_STATE: Record<Payslip["payment"]["state"], { label: string; color: string; fill: string }> = {
  lunas: { label: "LUNAS", color: "#1f6b35", fill: "#eef7f0" },
  sebagian: { label: "DIBAYAR SEBAGIAN", color: C.amber, fill: C.amberSoft },
  belum: { label: "BELUM DIBAYAR", color: C.red, fill: C.redSoft },
  kosong: { label: "TIDAK ADA PEMBAYARAN", color: C.muted, fill: C.soft },
};

// Status pembayaran gajian untuk periode ini (dari catatan Gajian manajer).
function paymentBlock(doc: Doc, y: number, slip: Payslip): number {
  const p = slip.payment;
  const s = PAYMENT_STATE[p.state];
  const lines = p.payments.slice(-3).map(
    (pay) =>
      `Dibayar ${dateShort(pay.paidAt)} · ${pay.method === "Cash" ? "Tunai" : "Transfer"} · gaji s/d ${dateShort(`${pay.paidUntil}T12:00:00+07:00`)} · diserahkan ${rp(pay.netPaid)}${
        pay.advanceDeducted ? ` (potong kasbon ${rp(pay.advanceDeducted)})` : ""
      }`,
  );
  for (const t of p.thr ?? []) {
    lines.push(`THR ${t.holidayName} dibayar ${dateShort(t.paidAt)}: ${rp(t.amount)} (di luar gaji bulanan)`);
  }
  if (p.unpaidAmount > 0) lines.push(`Belum dibayar untuk periode ini: ${rp(p.unpaidAmount)}`);
  if (p.advanceOutstanding > 0) lines.push(`Sisa kasbon (dipotong di gajian berikutnya): ${rp(p.advanceOutstanding)}`);
  if (lines.length === 0) lines.push("Belum ada gaji yang dikredit untuk periode ini.");

  const h = 24 + lines.length * 12;
  box(doc, M, y, W, h, s.fill, s.color);
  txt(doc, "STATUS PEMBAYARAN", M + 12, y + 8, { size: 7, bold: true, color: C.muted });
  txt(doc, s.label, M + W - 212, y + 6, { w: 200, size: 11, bold: true, color: s.color, align: "right" });
  lines.forEach((line, i) => {
    txt(doc, line, M + 12, y + 22 + i * 12, { w: W - 24, size: 8, color: C.ink });
  });
  return y + h + 10;
}

function summaryPage(doc: Doc, slip: Payslip) {
  let y = header(doc, slip, "SLIP GAJI");

  if (slip.provisional) {
    box(doc, M, y, W, 28, C.amberSoft, C.amber);
    txt(
      doc,
      "SLIP SEMENTARA — periode belum selesai. Angka dapat berubah; bonus kehadiran dihitung di akhir bulan.",
      M + 10,
      y + 9,
      { w: W - 20, size: 8.5, bold: true, color: C.amber },
    );
    y += 38;
  }

  // Identitas karyawan
  box(doc, M, y, W, 64, C.soft, C.line);
  const half = W / 2;
  const e = slip.employee;
  txt(doc, "NAMA KARYAWAN", M + 12, y + 9, { size: 7, bold: true, color: C.muted });
  txt(doc, e.name, M + 12, y + 19, { w: half - 24, size: 12, bold: true });
  txt(doc, "KODE · JABATAN", M + 12, y + 37, { size: 7, bold: true, color: C.muted });
  txt(doc, `${e.code ?? "-"} · ${e.position ?? "Karyawan"}`, M + 12, y + 47, { w: half - 24, size: 9.5 });
  txt(doc, "GAJI BULANAN", M + half + 12, y + 9, { size: 7, bold: true, color: C.muted });
  txt(doc, rp(e.monthlySalary), M + half + 12, y + 19, { w: half - 24, size: 12, bold: true });
  txt(doc, "UPAH HARIAN · JAM MASUK", M + half + 12, y + 37, { size: 7, bold: true, color: C.muted });
  txt(doc, `${rp(e.dailyWage)} / hari · ${e.shiftStart} WIB`, M + half + 12, y + 47, { w: half - 24, size: 9.5 });
  y += 76;

  y = statsRow(doc, y, slip);

  // Tabel penerimaan & potongan
  box(doc, M, y, W, 20, C.ink);
  txt(doc, "KETERANGAN", COLS.label, y + 6, { size: 8, bold: true, color: "#ffffff" });
  txt(doc, "RINCIAN", COLS.detail, y + 6, { size: 8, bold: true, color: "#ffffff" });
  txt(doc, "JUMLAH", COLS.amountRight - COLS.amountW, y + 6, {
    w: COLS.amountW,
    size: 8,
    bold: true,
    color: "#ffffff",
    align: "right",
  });
  y += 20;
  y = tableSection(doc, y, "PENERIMAAN", slip.earnings, slip.totalEarnings, "Total penerimaan", false);
  y = tableSection(doc, y, "POTONGAN", slip.deductions, slip.totalDeductions, "Total potongan", true);

  // Gaji bersih
  y += 4;
  box(doc, M, y, W, 58, C.redSoft, C.red);
  doc.save().rect(M, y, 5, 58).fill(C.red).restore();
  txt(doc, "GAJI BERSIH DITERIMA", M + 16, y + 10, { size: 10, bold: true });
  txt(doc, rp(slip.net), M + W - 250, y + 7, { w: 238, size: 20, bold: true, color: C.red, align: "right" });
  txt(doc, `Terbilang: ${terbilangRupiah(slip.net)}`, M + 16, y + 36, { w: W - 32, size: 8.5, italic: true, color: C.muted });
  y += 70;

  y = paymentBlock(doc, y, slip);

  txt(doc, `Status bonus kehadiran: ${slip.bonusStatus}`, M, y, { w: W, size: 8.5, color: C.muted });
  y += 14;
  txt(doc, "Ketentuan:", M, y, { size: 8, bold: true, color: C.muted });
  y += 11;
  for (const rule of slip.rules) {
    txt(doc, `• ${rule}`, M + 6, y, { w: W - 6, size: 7.8, color: C.muted });
    y = doc.y + 2;
  }

  // Tanda terima — pindah halaman bila tidak cukup ruang.
  if (y + 110 > CONTENT_BOTTOM) {
    doc.addPage();
    y = header(doc, slip, "SLIP GAJI");
  }
  y = Math.max(y + 16, CONTENT_BOTTOM - 100);
  const lastPaid = slip.payment.payments.at(-1);
  txt(
    doc,
    slip.payment.state === "lunas" && lastPaid
      ? `Tanggal diterima: ${dateLong(lastPaid.paidAt)}`
      : "Tanggal diterima: ____________________",
    M,
    y,
    { size: 9 },
  );
  const colW = W / 2;
  y += 22;
  txt(doc, "Diserahkan oleh,", M, y, { w: colW - 20, size: 9, color: C.muted });
  txt(doc, "Diterima oleh,", M + colW, y, { w: colW - 20, size: 9, color: C.muted });
  y += 50;
  hline(doc, y, C.ink, 0.8, M, M + colW - 40);
  hline(doc, y, C.ink, 0.8, M + colW, M + W - 40);
  txt(doc, "Manajer", M, y + 5, { w: colW - 40, size: 9, bold: true });
  txt(doc, e.name, M + colW, y + 5, { w: colW - 40, size: 9, bold: true });
}

function attendancePage(doc: Doc, slip: Payslip) {
  doc.addPage();
  let y = header(doc, slip, "LAMPIRAN");
  txt(doc, `Rincian kehadiran ${slip.employee.name} (${slip.employee.code ?? "-"})`, M, y, { w: W, size: 10.5, bold: true });
  y += 18;

  // Total lebar kolom = W (515); tiap sel diberi padding 6pt kiri-kanan.
  const cols: Array<{ key: string; label: string; w: number; align?: "right" }> = [
    { key: "date", label: "TANGGAL", w: 74 },
    { key: "in", label: "MASUK", w: 50 },
    { key: "out", label: "KELUAR", w: 50 },
    { key: "late", label: "TELAT", w: 52, align: "right" },
    { key: "status", label: "STATUS", w: 92 },
    { key: "wage", label: "UPAH", w: 72, align: "right" },
    { key: "ot", label: "LEMBUR", w: 58, align: "right" },
    { key: "fee", label: "FEE", w: 67, align: "right" },
  ];
  const drawRow = (values: Record<string, string>, rowY: number, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
    let x = M;
    for (const c of cols) {
      txt(doc, values[c.key] ?? "", x + 6, rowY, {
        w: c.w - 12,
        size: opts.size ?? 8.5,
        bold: opts.bold,
        color: opts.color,
        align: c.align,
      });
      x += c.w;
    }
  };

  box(doc, M, y, W, 18, C.ink);
  drawRow(Object.fromEntries(cols.map((c) => [c.key, c.label])), y + 5, { bold: true, color: "#ffffff", size: 7.5 });
  y += 18;

  slip.days.forEach((d, i) => {
    if (y + 16 > CONTENT_BOTTOM - 24) {
      doc.addPage();
      y = header(doc, slip, "LAMPIRAN");
    }
    if (i % 2 === 1) box(doc, M, y, W, 16, C.soft);
    const alert = d.status === "hangus" || d.status === "tidak_hadir" || d.status === "tidak_valid";
    drawRow(
      {
        date: dayLabel(d.date),
        in: clock(d.checkinAt),
        out: clock(d.checkoutAt),
        late: d.lateMinutes ? `${d.lateMinutes} mnt` : "-",
        status: d.statusLabel,
        wage: d.base ? num(d.base) : "-",
        ot: d.overtime ? num(d.overtime) : "-",
        fee: d.fee ? num(d.fee) : "-",
      },
      y + 4,
      { color: alert ? C.red : C.ink },
    );
    y += 16;
  });

  hline(doc, y, C.ink, 0.8);
  const sum = (k: "base" | "overtime" | "fee") => slip.days.reduce((s, d) => s + d[k], 0);
  drawRow(
    { date: "TOTAL", status: `${slip.attendance.presentDays} hari hadir`, wage: num(sum("base")), ot: num(sum("overtime")), fee: num(sum("fee")) },
    y + 5,
    { bold: true },
  );
}

/** Render satu/banyak slip ke satu PDF (A4). */
export function renderPayslipsPdf(slips: Payslip[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: M,
        bufferPages: true,
        info: {
          Title: slips.length === 1 ? `Slip Gaji ${slips[0].employee.name} ${slips[0].periodLabel}` : `Slip Gaji ${slips[0]?.periodLabel ?? ""}`,
          Author: "Garage OS",
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const ranges: Array<{ slip: Payslip; start: number; end: number }> = [];
      slips.forEach((slip, i) => {
        if (i > 0) doc.addPage();
        const start = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
        summaryPage(doc, slip);
        attendancePage(doc, slip);
        const range = doc.bufferedPageRange();
        ranges.push({ slip, start, end: range.start + range.count - 1 });
      });

      // Footer + nomor halaman per slip (margin bawah dinolkan agar pdfkit
      // tidak otomatis menambah halaman saat menulis di area footer).
      for (const r of ranges) {
        const total = r.end - r.start + 1;
        for (let p = r.start; p <= r.end; p++) {
          doc.switchToPage(p);
          const bottom = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;
          hline(doc, FOOTER_Y - 8);
          const left = `Dibuat otomatis oleh Garage OS · ${stamp(r.slip.generatedAt)}${r.slip.company.footerNote ? ` · ${r.slip.company.footerNote}` : ""}`;
          txt(doc, left, M, FOOTER_Y, { w: W - 150, size: 7, color: C.muted });
          txt(doc, `${r.slip.slipNo} · Hal. ${p - r.start + 1}/${total}`, M + W - 150, FOOTER_Y, {
            w: 150,
            size: 7,
            color: C.muted,
            align: "right",
          });
          doc.page.margins.bottom = bottom;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
