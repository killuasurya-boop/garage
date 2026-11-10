import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { approvePartnerSettlement, cancelPartnerSettlement, submitPartnerSettlement } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["submit", "approve", "cancel"]),
  reason: z.string().trim().max(300).optional(),
});

// Ajukan (kasir/Manajer) · Setujui (Owner) · Batalkan draft (Owner/Manajer). Role dicek ulang di service.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => {
    if (body.data.action === "submit") return submitPartnerSettlement(id, session.data);
    if (body.data.action === "approve") return approvePartnerSettlement(id, session.data);
    return cancelPartnerSettlement(id, body.data.reason ?? "", session.data);
  });
}
