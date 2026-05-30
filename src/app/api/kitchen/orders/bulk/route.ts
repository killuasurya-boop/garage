import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { bulkUpdateKitchenStatus } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const bulkStatusSchema = z.object({
  ticketNos: z.array(z.string()).min(1),
  status: z.enum(["cooking", "ready", "delivered"]),
});

export async function PATCH(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, bulkStatusSchema);
  if (body.error) {
    return body.error;
  }

  const result = await bulkUpdateKitchenStatus(body.data.ticketNos, body.data.status, session.data);
  return ok({
    count: result.updated.length,
    tickets: result.updated.map((t) => t.ticketNo),
    skipped: result.skipped,
  });
}
