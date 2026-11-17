import { fail, readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { createPerformer, getLineupBoard, performerInputSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Papan lineup + rundown + panitia + tugas + kesiapan satu event (Owner). `?eventId=` (master) atau `?event=` (nama lama). */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId");
  if (eventId && !/^[0-9a-f-]{36}$/i.test(eventId)) return fail(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  return lineupRoute(() => getLineupBoard(session.data, { eventId, eventName: params.get("event") }));
}

/** Tambah penampil (band / stand-up / …). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, performerInputSchema);
  if (body.error) return body.error;
  return lineupRoute(() => createPerformer(body.data, session.data), 201);
}
