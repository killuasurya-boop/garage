import { listInvoicesForFinance } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const params = new URL(request.url).searchParams;
  const result = await listInvoicesForFinance({
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    paymentMethod: params.get("paymentMethod") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    limit: parseIntParam(params.get("limit"), 50),
    offset: parseIntParam(params.get("offset"), 0),
  });
  return okWithEtag(request, result);
}
