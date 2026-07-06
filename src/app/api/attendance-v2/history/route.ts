import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getMonthAttendance } from "@/lib/garage-attendance-v2";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return fail(400, "MONTH_REQUIRED", "Query param 'month' harus format YYYY-MM.");
  }

  try {
    const rows = await getMonthAttendance(session.data!.user.id, month);
    return ok({ month, rows });
  } catch (err) {
    return fail(500, "HISTORY_FAILED", (err as Error).message);
  }
}
