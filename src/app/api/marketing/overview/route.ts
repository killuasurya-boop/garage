import { ok } from "@/lib/api-response";
import { getMarketingOverview } from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  return ok(await getMarketingOverview());
}
