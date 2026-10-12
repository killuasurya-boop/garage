import { listOpenServiceRequests } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const requests = await listOpenServiceRequests(session.data.profile.outlet.id);
  return okWithEtag(request, requests);
}
