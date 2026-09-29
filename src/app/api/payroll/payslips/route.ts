import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { staffWageConfig } from "@/db/schema";
import { fail } from "@/lib/api-response";
import { normalizeEmployeeCode } from "@/lib/garage-absen-employees";
import { buildPayslips } from "@/lib/garage-payslip";
import { pdfResponse, validatePayslipMonth } from "@/lib/garage-payslip-http";
import { renderPayslipsPdf } from "@/lib/garage-payslip-pdf";
import { requireGarageSession } from "@/lib/server-auth";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

// Slip gaji PDF untuk owner/manajer. Tanpa `code` = semua karyawan (siap cetak).
export async function GET(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const valid = validatePayslipMonth(url.searchParams.get("month"));
  if (!valid.ok) return fail(400, "MONTH_INVALID", valid.message);
  const rawCode = url.searchParams.get("code");
  const download = url.searchParams.get("download") === "1";

  try {
    let staffUserId: string | undefined;
    let code: string | null = null;
    if (rawCode) {
      code = normalizeEmployeeCode(rawCode);
      const [row] = await getDb()
        .select({ staffUserId: staffWageConfig.staffUserId })
        .from(staffWageConfig)
        .where(eq(staffWageConfig.absenCode, code))
        .limit(1);
      if (!row) return fail(404, "NOT_FOUND", `Karyawan ${code} tidak ditemukan.`);
      staffUserId = row.staffUserId;
    }

    const slips = await buildPayslips(valid.month, { staffUserId });
    if (slips.length === 0) {
      return fail(404, "NO_PAYSLIP", "Belum ada data gaji untuk periode ini.");
    }
    const pdf = await renderPayslipsPdf(slips);
    const name = code ? `Slip-Gaji-${code}-${valid.month}.pdf` : `Slip-Gaji-Semua-${valid.month}.pdf`;
    return pdfResponse(pdf, name, download);
  } catch (err) {
    return fail(500, "PAYSLIP_FAILED", (err as Error).message);
  }
}
