import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { recallKitchenTickets } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const recallSchema = z.object({
  ticketNos: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, recallSchema);
  if (body.error) {
    return body.error;
  }

  const results = await recallKitchenTickets(body.data.ticketNos, session.data);
  return ok({ count: results.length, tickets: results.map((t) => t.ticketNo) });
}
