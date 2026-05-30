import { ok } from "@/lib/api-response";
import { listOperationalAlertsForRole } from "@/lib/garage-ai-alerts";
import { roles } from "@/lib/garage-data";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(roles);
  if (session.response) {
    return session.response;
  }

  const payload = await listOperationalAlertsForRole(session.data.profile.role);
  return ok(payload);
}
