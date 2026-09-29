import { z } from "zod";

import { fail, readJson } from "@/lib/api-response";
import { absenErrorResponse, clientIp, resolveAbsenEmployee } from "@/lib/garage-absen";
import { buildPayslips } from "@/lib/garage-payslip";
import { pdfResponse, validatePayslipMonth } from "@/lib/garage-payslip-http";
import { renderPayslipsPdf } from "@/lib/garage-payslip-pdf";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().min(2).max(16),
  pin: z.string().regex(/^\d{4,8}$/),
  month: z.string(),
});

// Slip gaji milik karyawan sendiri (KODE + PIN). Maks 12 bulan terakhir.
export async function POST(request: Request) {
  if (!isPayrollV2Enabled()) return fail(503, "PAYROLL_V2_DISABLED", "Payroll V2 belum aktif.");
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const valid = validatePayslipMonth(body.data.month, new Date(), 12);
  if (!valid.ok) return fail(400, "MONTH_INVALID", valid.message);

  try {
    const employee = await resolveAbsenEmployee({
      code: body.data.code,
      pin: body.data.pin,
      ip: clientIp(request),
    });
    const [slip] = await buildPayslips(valid.month, { staffUserId: employee.staffUserId });
    if (!slip) return fail(404, "NO_PAYSLIP", "Belum ada data gaji untuk bulan ini.");
    const pdf = await renderPayslipsPdf([slip]);
    return pdfResponse(pdf, `Slip-Gaji-${employee.code}-${valid.month}.pdf`, true);
  } catch (err) {
    return absenErrorResponse(err);
  }
}
