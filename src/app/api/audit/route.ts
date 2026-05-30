import { ok } from "@/lib/api-response";
import { getAuditData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  const session = await requirePermission("audit:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const moduleFilter = url.searchParams.get("module") ?? undefined;

  return ok(
    await getAuditData({
      module: moduleFilter,
      actor: url.searchParams.get("actor") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      limit: parseIntParam(url.searchParams.get("limit"), 50),
      offset: parseIntParam(url.searchParams.get("offset"), 0),
    }),
  );
}
