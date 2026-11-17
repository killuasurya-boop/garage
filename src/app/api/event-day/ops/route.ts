import { readJson } from "@/lib/api-response";
import { eventDayRoute } from "@/lib/event-day-route";
import { addOpsCheck, getOpsChecklist, opsCheckCreateSchema } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Checklist operasional & keselamatan event (Owner/Manajer). `?eventId=`; item bawaan dibuat otomatis. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return eventDayRoute(async () => ({ eventId: null, items: [], done: 0, total: 0 }));
  return eventDayRoute(() => getOpsChecklist(eventId, session.data));
}

/** Tambah item checklist sendiri (Owner). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, opsCheckCreateSchema);
  if (body.error) return body.error;
  return eventDayRoute(() => addOpsCheck(body.data, session.data), 201);
}
