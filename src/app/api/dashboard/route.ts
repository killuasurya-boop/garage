import { getDashboardData } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) {
    return session.response;
  }

  const data = await getDashboardData();
  return okWithEtag(request, data);
}
