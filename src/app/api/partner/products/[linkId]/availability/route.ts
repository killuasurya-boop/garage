import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { setPartnerProductAvailability } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";

const schema = z.object({ available: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => setPartnerProductAvailability(linkId, body.data.available, { partner: session.data }));
}
