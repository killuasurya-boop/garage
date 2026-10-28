import { accountabilityFailure } from "@/lib/accountability-route";
import { ok } from "@/lib/api-response";
import { escalateRiskAlert } from "@/lib/risk-engine";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

/** B6: angkat alert menjadi kasus investigasi (audit_cases), tanpa asumsi pelaku. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await escalateRiskAlert(id, session.data));
  } catch (error) {
    return accountabilityFailure(error);
  }
}
