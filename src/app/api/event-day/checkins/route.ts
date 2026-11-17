import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { checkIn, checkinSchema } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Check-in tamu di pintu: scan QR undangan (`code`) atau walk-in (`walkInName`). Owner/Manajer. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, checkinSchema);
  if (body.error) return body.error;
  return eventDayRoute(() => checkIn(body.data, session.data), 201);
}
