import { fail, ok, readJson } from "@/lib/api-response";
import {
  GarageAiProviderError,
  aiProviderSaveSchema,
  testAiProvider,
} from "@/lib/garage-ai-providers";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, aiProviderSaveSchema);
  if (body.error) {
    return body.error;
  }

  try {
    const result = await testAiProvider(body.data);

    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI provider tested",
      object: body.data.provider,
      device: session.data.profile.deviceLabel,
      status: result.status,
      metadata: {
        model: result.model,
        latencyMs: result.latencyMs,
      },
    }).catch(() => undefined);

    return ok(result);
  } catch (error) {
    if (error instanceof GarageAiProviderError) {
      return fail(error.status, error.code, error.message);
    }

    return fail(
      502,
      "AI_PROVIDER_TEST_FAILED",
      error instanceof Error ? error.message : "Provider AI gagal dites.",
    );
  }
}
