import { ok } from "@/lib/api-response";
import { getWarehouseDailyAuditSummary } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  return ok(await getWarehouseDailyAuditSummary({ date }));
}
