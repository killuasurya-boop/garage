import { ok } from "@/lib/api-response";
import { getAuditStats } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("audit:read");
  if (session.response) return session.response;

  return ok(await getAuditStats(), {
    headers: { "Cache-Control": "no-store" },
  });
}
