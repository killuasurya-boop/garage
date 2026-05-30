import { ok } from "@/lib/api-response";
import { getApprovalStats } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("approvals:read");
  if (session.response) return session.response;

  return ok(await getApprovalStats(), {
    headers: { "Cache-Control": "no-store" },
  });
}
