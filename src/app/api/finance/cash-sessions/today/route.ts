import { ok } from "@/lib/api-response";
import { getTodayCashShiftStatus } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Status shift kasir hari ini untuk dialog "Mulai Shift" di POS.
export async function GET() {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }
  return ok(await getTodayCashShiftStatus(session.data));
}
