import { ok } from "@/lib/api-response";
import { getCrmDashboardMetrics } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  return ok(await getCrmDashboardMetrics());
}
