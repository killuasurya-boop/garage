import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { guestInputSchema, updateGuest } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = guestInputSchema.partial().extend({ status: z.enum(["active", "archived"]).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string; guestId: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id, guestId } = await context.params;
  const bad = invalidId(id, guestId);
  if (bad) return bad;
  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;
  try {
    const guest = await updateGuest(id, guestId, body.data, eventActor(session.data));
    return ok({ guest: { id: guest.id, status: guest.status } });
  } catch (error) {
    return eventErrorResponse(error, "Gagal mengubah tamu.");
  }
}
