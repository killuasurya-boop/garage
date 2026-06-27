import { ok } from "@/lib/api-response";
import { getPublishingReadinessReport } from "@/lib/garage-integrations";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  return ok(await getPublishingReadinessReport());
}
