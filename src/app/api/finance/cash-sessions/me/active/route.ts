import { ok } from "@/lib/api-response";
import { getActiveCashSessionForCashier } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const data = await getActiveCashSessionForCashier(session.data.user.id);
  return ok({ session: data });
}
