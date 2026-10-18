import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { EVENT_STATUSES, EventError, setEventStatus } from "@/lib/event-service";
import { createAuditLog } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const LABEL = { draft: "dikembalikan ke draft", published: "diterbitkan", archived: "diarsipkan" } as const;

// Terbitkan / tarik ke draft / arsipkan event.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_EVENT_ID", "ID event tidak valid.");
  const body = await readJson(request, z.object({ status: z.enum(EVENT_STATUSES) }));
  if (body.error) return body.error;
  try {
    const event = await setEventStatus(id, body.data.status, session.data.user.id);
    await createAuditLog({
      actor: `${session.data.user.name} / ${session.data.profile.role}`,
      action: `Event: ${LABEL[body.data.status]}`,
      object: event.title,
      device: session.data.profile.deviceLabel ?? "OS",
      metadata: { eventId: id, status: body.data.status },
    }).catch(() => undefined);
    return ok({ event });
  } catch (error) {
    if (error instanceof EventError) return fail(error.status, error.code, error.message);
    console.error("[events] status failed", error);
    return fail(500, "EVENT_STATUS_FAILED", "Gagal mengubah status event.");
  }
}
