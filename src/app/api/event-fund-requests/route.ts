import { fail } from "@/lib/api-response";
import { listFundRequests } from "@/lib/event-fund-request-service";
import { lineupRoute } from "@/lib/event-lineup-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Pengajuan dana panitia satu event (Owner). `?eventId=` wajib. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return fail(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  return lineupRoute(() => listFundRequests(eventId, session.data));
}
