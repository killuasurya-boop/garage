import { eventDayRoute } from "@/lib/event-day-route";
import { getEventDay } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Hari-H event (Owner/Manajer): check-in & kapasitas, rundown panggung (sedang tampil, berikutnya, telat). `?eventId=`. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId");
  return eventDayRoute(() => getEventDay(session.data, eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null));
}
