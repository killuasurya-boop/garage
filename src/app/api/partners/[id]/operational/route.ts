import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { setPartnerOperationalStatus } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(["buka", "jeda", "tutup"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => setPartnerOperationalStatus(id, body.data.status, { garage: session.data }));
}
