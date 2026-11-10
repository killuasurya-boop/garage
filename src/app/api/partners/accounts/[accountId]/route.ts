import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { updatePartnerAccount } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 angka.").optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { accountId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => updatePartnerAccount(accountId, body.data, session.data));
}
