import { getClosingOverview } from "@/lib/finance-closing";
import { closingResponse } from "@/lib/finance-closing-api";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status daily closing 14 hari terakhir + monthly closing 12 bulan.
export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  return closingResponse(() => getClosingOverview());
}
