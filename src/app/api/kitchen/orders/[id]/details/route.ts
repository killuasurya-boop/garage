import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updateKitchenTicketDetails } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const updateDetailsSchema = z.object({
  station: z.enum(["Food", "Bar", "Packaging"]).optional(),
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

  const body = await readJson(request, updateDetailsSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  const ticket = await updateKitchenTicketDetails(id, body.data, session.data);
  if (!ticket) {
    return fail(404, "TICKET_NOT_FOUND", "Kitchen ticket was not found.");
  }

  return ok(ticket);
}