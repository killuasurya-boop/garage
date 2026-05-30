import { ok } from "@/lib/api-response";
import { getFinanceClosingReadiness } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }

  return ok(
    await getFinanceClosingReadiness(session.data.profile.outlet.id),
  );
}
