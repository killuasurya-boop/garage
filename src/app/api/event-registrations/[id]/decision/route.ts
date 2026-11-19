import { fail } from "@/lib/api-response";
import { registrationRoute } from "@/lib/event-registration-route";
import { decideRegistration } from "@/lib/event-registration-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Owner: setujui (penampil/sponsor/panitia dibuat & tampil) · minta revisi · tolak — catatan wajib selain setujui. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "INVALID_ID", "ID pendaftar tidak valid.");
  const body = await request.json().catch(() => null);
  return registrationRoute(() => decideRegistration(id, body, session.data));
}
