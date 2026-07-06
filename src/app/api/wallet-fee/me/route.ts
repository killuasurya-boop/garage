import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getFeeWalletSummary } from "@/lib/garage-fee-pool";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  try {
    const summary = await getFeeWalletSummary(session.data!.user.id);
    return ok(summary);
  } catch (err) {
    return fail(500, "WALLET_FEE_FAILED", (err as Error).message);
  }
}
