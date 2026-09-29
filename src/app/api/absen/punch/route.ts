import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { staffAttendanceV2 } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import {
  absenErrorResponse,
  clientIp,
  getAbsenDashboard,
  resolveAbsenEmployee,
  resolveAbsenMethod,
} from "@/lib/garage-absen";
import { checkinV2, checkoutV2 } from "@/lib/garage-attendance-v2";
import { creditDailyWage } from "@/lib/garage-daily-wage";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().min(2).max(16),
  pin: z.string().regex(/^\d{4,8}$/),
  kind: z.enum(["checkin", "checkout"]),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  selfieBase64: z.string().max(3_500_000).optional().nullable(),
  device: z.string().max(64).optional().nullable(),
});

// Check-in / check-out lewat identitas absen (KODE + PIN). Saat check-out,
// gaji hari itu langsung dikredit ke Wallet Gaji (idempoten; cron tidak dobel).
export async function POST(request: Request) {
  if (!isPayrollV2Enabled()) return fail(503, "PAYROLL_V2_DISABLED", "Payroll V2 belum aktif.");

  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { code, pin, kind, lat, lng, selfieBase64, device } = body.data;

  try {
    const employee = await resolveAbsenEmployee({ code, pin, ip: clientIp(request) });
    const input = {
      staffUserId: employee.staffUserId,
      pin,
      lat: lat ?? null,
      lng: lng ?? null,
      selfieBase64: selfieBase64 ?? null,
      device: device ?? null,
      method: await resolveAbsenMethod(),
    };

    let wage = null;
    if (kind === "checkin") {
      await checkinV2(input);
    } else {
      const out = await checkoutV2(input);
      // Baris shift yang baru ditutup (bisa tanggal kemarin utk shift malam).
      const [row] = await getDb()
        .select()
        .from(staffAttendanceV2)
        .where(eq(staffAttendanceV2.id, out.id))
        .limit(1);
      if (row) {
        wage = await creditDailyWage({
          staffUserId: employee.staffUserId,
          date: String(row.date),
          attendanceId: row.id,
          lateMinutes: row.lateMinutes ?? 0,
          overtimeMinutes: row.overtimeMinutes ?? 0,
          status: row.status,
        });
      }
    }

    const dashboard = await getAbsenDashboard(employee.staffUserId);
    return ok({
      kind,
      wage: wage
        ? {
            baseWage: wage.baseWage,
            overtimeAmount: wage.overtimeAmount,
            totalCredited: wage.totalCredited,
          }
        : null,
      ...dashboard,
    });
  } catch (err) {
    return absenErrorResponse(err);
  }
}
