import { ok } from "@/lib/api-response";
import { getKitchenPerformanceData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getKitchenPerformanceData({
      range: url.searchParams.get("range") ?? undefined,
      viewerRole: session.data.profile.role,
    }),
  );
}
