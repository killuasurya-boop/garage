import { ok } from "@/lib/api-response";
import { getStaffLeaderboard } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  try {
    const data = await getStaffLeaderboard();
    return ok({ data });
  } catch {
    return ok({ data: [] });
  }
}
