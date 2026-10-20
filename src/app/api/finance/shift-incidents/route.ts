import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import {
  assertSessionAccess,
  createShiftIncident,
  INCIDENT_STATUSES,
  listShiftIncidents,
} from "@/lib/cashier-accountability";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const incidentSchema = z.object({
  cashSessionId: z.string().uuid().optional(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(1000),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  orderNo: z.string().trim().max(60).optional(),
  financialImpact: z.number().int().min(-100_000_000).max(100_000_000).optional(),
  actionTaken: z.string().trim().max(1000).optional(),
  responsibleName: z.string().trim().max(120).optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
});

/** Catatan kejadian untuk satu shift: ?sessionId=… */
export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  try {
    if (!sessionId) return ok({ incidents: [] });
    await assertSessionAccess(sessionId, session.data);
    return ok({ incidents: await listShiftIncidents({ cashSessionIds: [sessionId] }) });
  } catch (error) {
    return accountabilityFailure(error);
  }
}

export async function POST(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const body = await readJson(request, incidentSchema);
  if (body.error) return body.error;
  try {
    return ok(await createShiftIncident(body.data, session.data), { status: 201 });
  } catch (error) {
    return accountabilityFailure(error);
  }
}
