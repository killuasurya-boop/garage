import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { KitchenTransitionError, updateKitchenStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const statusSchema = z.object({
  status: z.enum(["queue", "cooking", "ready", "delivered"]),
  priority: z.enum(["normal", "pinned"]).optional(),
  itemNotes: z.record(z.string(), z.unknown()).optional(),
  internalNotes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, statusSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const ticket = await updateKitchenStatus(id, body.data.status, session.data);
    if (!ticket) {
      return fail(404, "TICKET_NOT_FOUND", "Kitchen ticket was not found.");
    }
    return ok(ticket);
  } catch (error) {
    if (error instanceof KitchenTransitionError) {
      return fail(422, "INVALID_TRANSITION", error.message);
    }
    throw error;
  }
}
