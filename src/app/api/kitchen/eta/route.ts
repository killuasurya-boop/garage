import { ok } from "@/lib/api-response";
import { getKitchenEtaEstimates } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const rawDays = url.searchParams.get("days");
  const windowDays = rawDays ? Number(rawDays) : undefined;

  return ok(
    await getKitchenEtaEstimates({
      windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
    }),
  );
}
