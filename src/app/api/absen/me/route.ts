import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  absenErrorResponse,
  clientIp,
  getAbsenDashboard,
  resolveAbsenEmployee,
} from "@/lib/garage-absen";
import { ensureDailyBackup } from "@/lib/garage-db-backup";
import { finalizePendingPayrollDays } from "@/lib/garage-payroll-cron";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().min(2).max(16),
  pin: z.string().regex(/^\d{4,8}$/),
});

// Login absen (KODE + PIN) + data dasbor HP karyawan. Tanpa sesi akun sistem.
export async function POST(request: Request) {
  if (!isPayrollV2Enabled()) return fail(503, "PAYROLL_V2_DISABLED", "Payroll V2 belum aktif.");

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const employee = await resolveAbsenEmployee({ ...body.data, ip: clientIp(request) });
    try {
      await finalizePendingPayrollDays();
    } catch {
      /* finalisasi tertunda tidak boleh menghalangi absen */
    }
    // Backup harian otomatis (sekali sehari) — jalan di belakang, tidak menunda login.
    void ensureDailyBackup().catch((err) => console.error("[backup] harian gagal", err));
    const dashboard = await getAbsenDashboard(employee.staffUserId);
    return ok({
      employee: {
        code: employee.code,
        name: employee.name,
        position: employee.position,
        dailyWage: employee.dailyWage,
      },
      ...dashboard,
    });
  } catch (err) {
    return absenErrorResponse(err);
  }
}
