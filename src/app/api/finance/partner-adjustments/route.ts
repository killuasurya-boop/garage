import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { createPartnerAdjustment } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  partnerId: z.string().uuid(),
  kind: z.enum(["discount_partner", "correction", "dispute"]),
  salesDelta: z.number().int(),
  liabilityDelta: z.number().int(),
  qty: z.number().int().optional(),
  reason: z.string().trim().min(3).max(300),
  orderLineId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => createPartnerAdjustment(body.data, session.data), 201);
}
