import { ok } from "@/lib/api-response";
import { getApprovalData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("approvals:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getApprovalData({
      status: url.searchParams.get("status") ?? undefined,
    }),
  );
}
