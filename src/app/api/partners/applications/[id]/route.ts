import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { updatePartnerApplication } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["baru", "dihubungi", "diterima", "ditolak"]).optional(),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => updatePartnerApplication(id, body.data, session.data));
}
