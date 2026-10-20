import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import { INCIDENT_STATUSES, updateShiftIncident } from "@/lib/cashier-accountability";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const updateSchema = z.object({
  actionTaken: z.string().trim().max(1000).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  managerNote: z.string().trim().max(1000).optional(),
  responsibleName: z.string().trim().max(120).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const body = await readJson(request, updateSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await updateShiftIncident(id, body.data, session.data));
  } catch (error) {
    return accountabilityFailure(error);
  }
}
