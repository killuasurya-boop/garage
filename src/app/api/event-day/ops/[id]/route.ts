import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { opsCheckPatchSchema, updateOpsCheck } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Centang / buka item checklist, isi PIC & catatan (Owner/Manajer). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, opsCheckPatchSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventDayRoute(() => updateOpsCheck(id, body.data, session.data));
}
