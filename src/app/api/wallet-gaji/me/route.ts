import { fail, ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { getGajiWalletSummary } from "@/lib/garage-daily-wage";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  try {
    const summary = await getGajiWalletSummary(session.data!.user.id);
    return ok(summary);
  } catch (err) {
    return fail(500, "WALLET_GAJI_FAILED", (err as Error).message);
  }
}
