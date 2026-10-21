import { fail, ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse } from "@/lib/event-api";
import { createCommerceEvent, eventCreateSchema } from "@/lib/event-menu-service";
import { getEventForAdmin, listEventsForAdmin } from "@/lib/event-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  try {
    return ok({ events: await listEventsForAdmin(session.data.profile.outlet.id) });
  } catch (error) {
    console.error("[events] list failed", error);
    return fail(500, "EVENTS_FAILED", "Gagal memuat event.");
  }
}

export async function POST(request: Request) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const body = await readJson(request, eventCreateSchema);
  if (body.error) return body.error;
  if (body.data.outletId && body.data.outletId !== session.data.profile.outlet.id) return fail(403, "EVENT_OUTLET_FORBIDDEN", "Pilih outlet aktif sebelum membuat event.");
  try {
    const created = await createCommerceEvent(body.data, { ...eventActor(session.data), outletId: session.data.profile.outlet.id });
    return ok({ event: await getEventForAdmin(created.id, session.data.profile.outlet.id) }, { status: 201 });
  } catch (error) { return eventErrorResponse(error, "Gagal membuat event."); }
}
