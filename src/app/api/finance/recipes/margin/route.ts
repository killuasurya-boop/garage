import { ok } from "@/lib/api-response";
import { getMenuMarginReport } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const data = await getMenuMarginReport(session.data);
  return ok({ rows: data });
}
