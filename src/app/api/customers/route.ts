import { ok } from "@/lib/api-response";
import { getCustomerData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getCustomerData({
      q: url.searchParams.get("q") ?? undefined,
      tier: url.searchParams.get("tier") ?? undefined,
    }),
  );
}
