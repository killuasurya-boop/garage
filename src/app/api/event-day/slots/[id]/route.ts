import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { setSlotState, slotActionSchema } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Mode stage manager: mulai / selesai / batalkan jam tampil nyata penampil. Owner/Manajer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, slotActionSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventDayRoute(() => setSlotState(id, body.data.action, session.data));
}
