import { ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { archiveEventMenuEntry, eventMenuEntrySchema, saveEventMenuEntry } from "@/lib/event-menu-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; entryId: string }> };
export async function PUT(request: Request, context: Context) {
  const session = await requirePermission("events:manage"); if (session.response) return session.response;
  const { id, entryId } = await context.params;
  const invalid = invalidId(id, entryId); if (invalid) return invalid;
  const body = await readJson(request, eventMenuEntrySchema); if (body.error) return body.error;
  try { return ok(await saveEventMenuEntry(id, body.data, { ...eventActor(session.data), outletId: session.data.profile.outlet.id }, entryId)); }
  catch (error) { return eventErrorResponse(error, "Gagal mengubah menu event."); }
}
export async function DELETE(_request: Request, context: Context) {
  const session = await requirePermission("events:manage"); if (session.response) return session.response;
  const { id, entryId } = await context.params;
  const invalid = invalidId(id, entryId); if (invalid) return invalid;
  try { return ok(await archiveEventMenuEntry(id, entryId, { ...eventActor(session.data), outletId: session.data.profile.outlet.id })); }
  catch (error) { return eventErrorResponse(error, "Gagal mengarsipkan menu event."); }
}
