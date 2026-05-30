import { ok } from "@/lib/api-response";
import { getMarketingCalendar } from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const monthStart = url.searchParams.get("start") ?? undefined;
  const monthEnd = url.searchParams.get("end") ?? undefined;

  return ok(await getMarketingCalendar({ monthStart, monthEnd }));
}
