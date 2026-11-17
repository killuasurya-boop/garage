import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { createCrew, crewInputSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tambah panitia (peran + tugas utama + WhatsApp). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, crewInputSchema);
  if (body.error) return body.error;
  return lineupRoute(() => createCrew(body.data, session.data), 201);
}
