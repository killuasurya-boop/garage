import { fail, ok } from "@/lib/api-response";
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "@/lib/garage-integrations";
import { runIntegrationHealthCheck } from "@/lib/garage-provider-adapters";
import { auditSafely } from "@/lib/garage-social-audit";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) return session.response;
  const { provider } = await context.params;
  if (!INTEGRATION_PROVIDERS.includes(provider as IntegrationProvider)) {
    return fail(404, "INTEGRATION_UNKNOWN", "Provider integrasi tidak dikenal.");
  }
  const result = await runIntegrationHealthCheck(provider as IntegrationProvider);
  auditSafely({
    actor: session.data.user.id,
    action: "integration.test",
    object: provider,
    status: result.ok ? "success" : "failed",
    metadata: result.ok ? { provider } : { provider, error: result.error },
  });
  return result.ok
    ? ok(result)
    : fail(409, "INTEGRATION_HEALTH_FAILED", result.error || "Health check gagal.");
}
