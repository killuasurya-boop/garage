import { ok } from "@/lib/api-response";
import { getExecutiveTtsStatus } from "@/lib/executive-tts";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  return ok({
    ...getExecutiveTtsStatus(),
    smartNotificationUsesEdge: getExecutiveTtsStatus().edge.enabled,
  });
}
