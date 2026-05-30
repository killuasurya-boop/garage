import { ok } from "@/lib/api-response";
import { getTableLiveData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Mirror dari /api/tables/live tapi disebut dari modul Waiter untuk
// memudahkan tracing/audit & permission-gating yang spesifik untuk waiter.
export async function GET() {
  const session = await requirePermission("tables:read");
  if (session.response) {
    return session.response;
  }
  return ok(await getTableLiveData());
}
