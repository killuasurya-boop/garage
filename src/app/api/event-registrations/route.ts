import { fail } from "@/lib/api-response";
import { listMasterEvents } from "@/lib/event-master";
import { registrationRoute } from "@/lib/event-registration-route";
import { listRegistrations } from "@/lib/event-registration-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pendaftar GIGS satu event (Owner): semua isian termasuk kontak & nilai dukungan. Tanpa eventId → event master pertama. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const asked = new URL(request.url).searchParams.get("eventId");
  if (asked && !/^[0-9a-f-]{36}$/i.test(asked)) return fail(400, "INVALID_EVENT", "Event tidak valid.");
  return registrationRoute(async () => {
    const masterEvents = await listMasterEvents();
    const eventId = asked ?? masterEvents[0]?.id ?? null;
    return { masterEvents, eventId, registrations: eventId ? await listRegistrations(eventId, session.data) : [] };
  });
}
