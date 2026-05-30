import { ok, fail } from "@/lib/api-response";
import { getCustomerLastOrder } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId") ?? undefined;
  const phone = url.searchParams.get("phone") ?? undefined;
  if (!customerId && !phone) {
    return fail(400, "MISSING_PARAM", "customerId atau phone wajib diisi.");
  }

  return ok(await getCustomerLastOrder({ customerId, phone }));
}
