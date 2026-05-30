import { isDatabaseConfigured } from "@/db";
import { fail, ok } from "@/lib/api-response";
import {
  getSecurityOverview,
  listActiveSessions,
  listSecurityAuditLogs,
} from "@/lib/garage-security-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const actionPrefix = url.searchParams.get("action") ?? undefined;

  const [overview, sessions, auditLogs] = await Promise.all([
    getSecurityOverview(),
    listActiveSessions(50),
    listSecurityAuditLogs({ query, actionPrefix, limit: 100 }),
  ]);

  return ok({ overview, sessions, auditLogs });
}
