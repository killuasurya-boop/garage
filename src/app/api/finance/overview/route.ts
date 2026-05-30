import { ok } from "@/lib/api-response";
import { getFinanceOverview, getFinanceSummary } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }

  const [overview, summary] = await Promise.all([
    getFinanceOverview(),
    getFinanceSummary(),
  ]);

  return ok({
    ...overview,
    cashSession: summary.cashSession,
    paymentBreakdown: summary.paymentBreakdown,
  });
}
