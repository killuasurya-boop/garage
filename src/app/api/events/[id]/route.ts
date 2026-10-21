import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { EventError, eventUpdateSchema, getEventForAdmin, updateEvent } from "@/lib/event-service";
import { createAuditLog } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_EVENT_ID", "ID event tidak valid.");
  const event = await getEventForAdmin(id, session.data.profile.outlet.id);
  if (!event) return fail(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  return ok({ event });
}

export async function PATCH(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_EVENT_ID", "ID event tidak valid.");
  const body = await readJson(request, eventUpdateSchema);
  if (body.error) return body.error;
  try {
    const result = await updateEvent(id, body.data, session.data.user.id, session.data.profile.outlet.id);
    await createAuditLog({
      actor: `${session.data.user.name} / ${session.data.profile.role}`,
      action: result.changedFacts.length ? "Event: fakta acara diubah" : "Event: konten diperbarui",
      object: result.event.title,
      device: session.data.profile.deviceLabel ?? "OS",
      metadata: { eventId: id, changedFacts: result.changedFacts, contentVersion: result.event.contentVersion },
    }).catch(() => undefined);
    return ok(result);
  } catch (error) {
    if (error instanceof EventError) return fail(error.status, error.code, error.message);
    console.error("[events] update failed", error);
    return fail(500, "EVENT_UPDATE_FAILED", "Gagal menyimpan event.");
  }
}
