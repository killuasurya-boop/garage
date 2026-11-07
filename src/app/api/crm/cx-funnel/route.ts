import { ok } from "@/lib/api-response";
import { getInvoiceFunnelMetrics } from "@/lib/customer-experience-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Funnel invoice → member untuk Owner/CRM (CX Engine V4). Hanya-baca.
export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  return ok(await getInvoiceFunnelMetrics(Number.isFinite(days) ? days : 30));
}
