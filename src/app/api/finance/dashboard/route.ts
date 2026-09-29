import { fail, ok } from "@/lib/api-response";
import { getFinanceControlDashboard } from "@/lib/finance-control";
import { parseFinancePeriod } from "@/lib/finance-control-api";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CEO Dashboard — Garage Financial Control System (PRD V2.0 §21, §50).
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }

  const period = parseFinancePeriod(request);
  if (period.error) {
    return period.error;
  }

  try {
    return ok(await getFinanceControlDashboard(period.data));
  } catch (error) {
    console.error("[finance/dashboard]", error);
    return fail(500, "FINANCE_ENGINE_ERROR", "Gagal menghitung dashboard keuangan.");
  }
}
