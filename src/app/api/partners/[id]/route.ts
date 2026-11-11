import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { updatePartnerProfile } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  picName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  productKind: z.string().trim().max(120).nullable().optional(),
  handoverPoint: z.string().trim().max(200).nullable().optional(),
  lastOrderByDay: z.record(z.string().regex(/^[0-6]$/), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()).optional(),
  payoutSchedule: z.string().trim().max(200).nullable().optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => updatePartnerProfile(id, body.data, session.data));
}
