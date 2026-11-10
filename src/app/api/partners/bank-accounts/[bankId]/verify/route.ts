import { verifyPartnerBankAccount } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ bankId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { bankId } = await context.params;
  return partnerRoute(() => verifyPartnerBankAccount(bankId, session.data));
}
