import { fail, readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { incidentResolveSchema, resolveIncident } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tandai kejadian selesai ditangani (wajib keterangan; sekali saja). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer", "Panitia"]);
  if (session.response) return session.response;
  const body = await readJson(request, incidentResolveSchema);
  if (body.error) return body.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "INVALID_ID", "ID kejadian tidak valid.");
  return eventDayRoute(() => resolveIncident(id, body.data, session.data));
}
