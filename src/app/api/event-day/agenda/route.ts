import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { syncAgendaFromRundown } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ eventId: z.string().uuid() });

/** Owner: salin rundown Lineup (penampil terkonfirmasi) ke agenda undangan / halaman event. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return eventDayRoute(() => syncAgendaFromRundown(body.data.eventId, session.data));
}
