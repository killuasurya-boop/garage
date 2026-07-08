import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getTodayAttendance } from "@/lib/garage-attendance-v2";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  // Konsisten dgn checkin/checkout: saat Payroll V2 OFF, jangan query tabel V2
  // (bisa belum dimigrasi) — balikan kosong yang rapi, bukan 500.
  if (!isPayrollV2Enabled()) return ok({ attendance: null });

  try {
    const row = await getTodayAttendance(session.data!.user.id);
    return ok({ attendance: row });
  } catch (err) {
    return fail(500, "TODAY_FAILED", (err as Error).message);
  }
}
