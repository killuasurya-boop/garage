import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { crewPatchSchema, updateCrew } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ubah panitia atau nonaktifkan (tidak dihapus). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, crewPatchSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return lineupRoute(() => updateCrew(id, body.data, session.data));
}
