import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { createPerformer, getLineupBoard, performerInputSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Papan lineup + rundown + panitia + tugas + kesiapan satu event (Owner; Manajer baca — GIGS EO #9). `?event=`. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const event = new URL(request.url).searchParams.get("event");
  return lineupRoute(() => getLineupBoard(session.data, event));
}

/** Tambah penampil (band / stand-up / …). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, performerInputSchema);
  if (body.error) return body.error;
  return lineupRoute(() => createPerformer(body.data, session.data), 201);
}
