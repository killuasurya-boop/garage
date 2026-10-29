import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Audit #12: laporan pelanggaran Content-Security-Policy (mode report-only dulu).
// Browser mengirim `application/csp-report` (CSP2) atau `application/reports+json` (Reporting API).
// Dicatat ke audit_logs (action csp_violation) untuk ditinjau sebelum CSP ditegakkan.
type Violation = { directive: string; blocked: string; page: string; source: string };

function pick(value: unknown): Violation[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      const raw = (item as { "csp-report"?: Record<string, unknown>; body?: Record<string, unknown> }) ?? {};
      const r = (raw["csp-report"] ?? raw.body ?? raw) as Record<string, unknown>;
      return {
        directive: String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "").slice(0, 80),
        blocked: String(r["blocked-uri"] ?? r.blockedURL ?? "").slice(0, 200),
        page: String(r["document-uri"] ?? r.documentURL ?? "").slice(0, 200),
        source: String(r["source-file"] ?? r.sourceFile ?? "").slice(0, 200),
      };
    })
    .filter((v) => v.directive);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "csp-report", { limit: 20, windowMs: 60_000 });
  if (limited) return new Response(null, { status: 204 });
  const text = await request.text().catch(() => "");
  if (!text || text.length > 20_000) return new Response(null, { status: 204 });
  let violations: Violation[] = [];
  try {
    violations = pick(JSON.parse(text)).slice(0, 5);
  } catch {
    return new Response(null, { status: 204 });
  }
  if (violations.length) {
    await getDb()
      .insert(auditLogs)
      .values(
        violations.map((v) => ({
          time: new Date().toISOString(),
          actor: "browser",
          action: "csp_violation",
          object: `${v.directive} · ${v.blocked || "inline"}`.slice(0, 200),
          device: "csp",
          status: "warning",
          metadata: v,
        })),
      )
      .catch(() => undefined);
  }
  return new Response(null, { status: 204 });
}
