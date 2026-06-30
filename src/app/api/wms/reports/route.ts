import { ok } from "@/lib/api-response";
import { getWmsReports } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  return ok(
    await getWmsReports({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    }),
  );
}
