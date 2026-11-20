import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { incidentCreateSchema, listIncidents, reportIncident } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Log kejadian Hari-H (`?eventId=`): Owner, Manajer, Panitia event itu. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Panitia"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return eventDayRoute(async () => ({ eventId: null, items: [], open: 0, total: 0 }));
  return eventDayRoute(() => listIncidents(eventId, session.data));
}

/** Catat kejadian (TINGGI → notifikasi ke HP Owner). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Panitia"]);
  if (session.response) return session.response;
  const body = await readJson(request, incidentCreateSchema);
  if (body.error) return body.error;
  return eventDayRoute(() => reportIncident(body.data, session.data), 201);
}
