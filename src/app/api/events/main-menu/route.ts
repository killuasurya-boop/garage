import { z } from "zod";
import { ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse } from "@/lib/event-api";
import { getMainDigitalMenuSelection, setMainDigitalMenuEvent } from "@/lib/event-main-menu-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
const selectionSchema = z.object({ eventId: z.string().uuid().nullable() });

export async function GET() {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  try { return ok(await getMainDigitalMenuSelection(session.data.profile.outlet.id)); }
  catch (error) { return eventErrorResponse(error, "Pengaturan menu utama gagal dimuat."); }
}

export async function PUT(request: Request) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const body = await readJson(request, selectionSchema);
  if (body.error) return body.error;
  try { return ok(await setMainDigitalMenuEvent(body.data.eventId, { ...eventActor(session.data), outletId: session.data.profile.outlet.id })); }
  catch (error) { return eventErrorResponse(error, "Pengaturan menu utama gagal disimpan."); }
}
