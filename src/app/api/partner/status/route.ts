import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { setPartnerOperationalStatus } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["buka", "jeda", "tutup"]) });

export async function POST(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => setPartnerOperationalStatus(session.data.partner.id, body.data.status, { partner: session.data }));
}
