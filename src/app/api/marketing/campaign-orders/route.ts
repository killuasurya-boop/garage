import { ok } from "@/lib/api-response";
import { getOrdersByCampaign } from "@/lib/garage-marketing-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Laporan order per sumber (campaign) — ?days=30 (1–365).
export async function GET(request: Request) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const days = Number(new URL(request.url).searchParams.get("days") ?? 30) || 30;
  return ok(await getOrdersByCampaign(days));
}
