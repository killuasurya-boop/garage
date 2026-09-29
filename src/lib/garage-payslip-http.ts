// Helper HTTP bersama untuk endpoint slip gaji (owner & karyawan).

import { jakartaDateKey } from "@/lib/attendance";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Validasi YYYY-MM: tidak boleh bulan depan, dan maks `maxMonthsBack` ke belakang. */
export function validatePayslipMonth(
  month: string | null | undefined,
  now = new Date(),
  maxMonthsBack = 24,
): { ok: true; month: string } | { ok: false; message: string } {
  if (!month || !MONTH_RE.test(month)) return { ok: false, message: "Bulan harus format YYYY-MM." };
  const current = jakartaDateKey(now).slice(0, 7);
  if (month > current) return { ok: false, message: "Slip bulan depan belum tersedia." };
  const [cy, cm] = current.split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  if ((cy - y) * 12 + (cm - m) > maxMonthsBack) {
    return { ok: false, message: `Slip hanya tersedia ${maxMonthsBack} bulan terakhir.` };
  }
  return { ok: true, month };
}

export function pdfResponse(pdf: Buffer, filename: string, download: boolean) {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
