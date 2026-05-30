import { ok } from "@/lib/api-response";
import { sessionPayload } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) {
    return session.response;
  }

  return ok(sessionPayload(session.data));
}
