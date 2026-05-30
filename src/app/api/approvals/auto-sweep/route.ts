import { ok } from "@/lib/api-response";
import { runAutoApprovalSweep } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requirePermission("approvals:decide");
  if (session.response) return session.response;

  return ok(await runAutoApprovalSweep(session.data));
}
