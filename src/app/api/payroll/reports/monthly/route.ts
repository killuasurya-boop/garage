import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getMonthlyReport } from "@/lib/garage-payroll-report";
import { finalizePendingPayrollDays } from "@/lib/garage-payroll-cron";
import { MANAGEMENT_ROLES } from "@/lib/role-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession(MANAGEMENT_ROLES);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return fail(400, "MONTH_REQUIRED", "Query 'month' harus format YYYY-MM.");
  }

  try {
    await finalizePendingPayrollDays(new Date(), 35).catch(() => []);
    const report = await getMonthlyReport(month);
    return ok(report);
  } catch (err) {
    return fail(500, "REPORT_FAILED", (err as Error).message);
  }
}
