import { getCustomerData } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const data = await getCustomerData({
    q: url.searchParams.get("q") ?? undefined,
    tier: url.searchParams.get("tier") ?? undefined,
    limit: parseIntParam(url.searchParams.get("limit"), 100),
    offset: parseIntParam(url.searchParams.get("offset"), 0),
  });
  return okWithEtag(request, data);
}
