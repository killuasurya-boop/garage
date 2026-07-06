import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getMonthlyReport } from "@/lib/garage-payroll-report";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

export async function GET(request: Request) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return fail(400, "MONTH_REQUIRED", "Query 'month' harus format YYYY-MM.");
  }

  try {
    const report = await getMonthlyReport(month);
    return ok(report);
  } catch (err) {
    return fail(500, "REPORT_FAILED", (err as Error).message);
  }
}
