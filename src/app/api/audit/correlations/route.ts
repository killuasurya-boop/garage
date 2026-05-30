import { ok } from "@/lib/api-response";
import { getAuditCorrelations } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  const url = new URL(req.url);
  const windowDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 7)));
  const data = await getAuditCorrelations({ windowDays });
  return ok(data);
}
