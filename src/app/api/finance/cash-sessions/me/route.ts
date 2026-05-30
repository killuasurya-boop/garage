import { ok } from "@/lib/api-response";
import { listCashSessionsForCashier } from "@/lib/garage-service";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const result = await listCashSessionsForCashier(session.data.user.id, {
    from: parseDateParam(url.searchParams.get("from")),
    to: parseDateParam(url.searchParams.get("to")),
    limit: parseIntParam(url.searchParams.get("limit"), 30),
    offset: parseIntParam(url.searchParams.get("offset"), 0),
  });
  return ok(result);
}
