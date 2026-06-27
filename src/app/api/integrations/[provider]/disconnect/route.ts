import { fail, ok } from "@/lib/api-response";
import {
  disconnectIntegration,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "@/lib/garage-integrations";
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
  const deleted = await disconnectIntegration(provider as IntegrationProvider);
  auditSafely({
    actor: session.data.user.id,
    action: "integration.disconnect",
    object: provider,
    status: "success",
    metadata: { provider, disconnectedResources: deleted.length },
  });
  return ok({ provider, disconnectedResources: deleted.length });
}
