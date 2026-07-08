import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getFeeWalletSummary } from "@/lib/garage-fee-pool";
import { isPayrollV2Enabled } from "@/lib/garage-payroll-settings";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  // V2 OFF → wallet fee kosong rapi (pool tak diakumulasi saat flag off), hindari 500.
  if (!isPayrollV2Enabled()) return ok({ balance: 0, entries: [] });

  try {
    const summary = await getFeeWalletSummary(session.data!.user.id);
    return ok(summary);
  } catch (err) {
    return fail(500, "WALLET_FEE_FAILED", (err as Error).message);
  }
}
