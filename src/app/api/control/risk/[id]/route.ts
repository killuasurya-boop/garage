import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import { decideRiskAlert } from "@/lib/risk-engine";
import { RISK_DISPOSITIONS, type RiskDisposition } from "@/lib/risk-rules";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const decideSchema = z.object({
  disposition: z.enum(RISK_DISPOSITIONS as [RiskDisposition, ...RiskDisposition[]]),
  note: z.string().trim().max(1000).optional(),
});

/** B6: keputusan pemeriksaan alert (kesimpulan akhir hanya Owner — dicek di service). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, decideSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await decideRiskAlert(id, body.data, session.data));
  } catch (error) {
    return accountabilityFailure(error);
  }
}
