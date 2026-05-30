import { ok } from "@/lib/api-response";
import { getStaffWalletBalance } from "@/lib/garage-earnings";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("earnings:read");
  if (session.response) return session.response;

  const wallet = await getStaffWalletBalance(session.data.user.id);
  return ok(wallet, {
    headers: { "Cache-Control": "no-store" },
  });
}
