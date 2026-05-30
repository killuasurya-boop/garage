import { fail, ok } from "@/lib/api-response";
import { acknowledgeOperationalAlert } from "@/lib/garage-ai-alerts";
import { roles } from "@/lib/garage-data";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await requireGarageSession(roles);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const alert = await acknowledgeOperationalAlert({
    id,
    role: session.data.profile.role,
    userId: session.data.user.id,
  });

  if (!alert) {
    return fail(404, "AI_ALERT_NOT_FOUND", "Alert tidak ditemukan atau tidak untuk role ini.");
  }

  return ok({ alert });
}
