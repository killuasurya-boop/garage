import { fail, ok, readJson } from "@/lib/api-response";
import {
  GarageAiProviderError,
  aiProviderTemplates,
  aiProviderSaveSchema,
  getAiProviderPublicConfigs,
  saveAiProviderConfig,
  testAiProvider,
} from "@/lib/garage-ai-providers";
import type { AiProviderConnectionTestResult } from "@/lib/garage-api-types";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  return ok({
    providers: await getAiProviderPublicConfigs(),
    templates: aiProviderTemplates,
  });
}

export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, aiProviderSaveSchema);
  if (body.error) {
    return body.error;
  }

  let providers;
  let connectionTest: AiProviderConnectionTestResult | null = null;
  try {
    const willClearKey =
      body.data.clearApiKey === true && !body.data.apiKey?.trim();
    providers = await saveAiProviderConfig(body.data);

    if (body.data.enabled && !willClearKey) {
      try {
        const result = await testAiProvider(body.data);
        connectionTest = {
          provider: result.provider,
          status: "ready",
          ok: true,
          providerStatus: result.status,
          latencyMs: result.latencyMs,
          message: result.message,
          model: result.model,
        };
      } catch (error) {
        if (error instanceof GarageAiProviderError) {
          connectionTest = {
            provider: body.data.provider,
            status: "failed",
            ok: false,
            providerStatus: error.providerStatus,
            latencyMs: error.latencyMs,
            message: error.message,
            model: body.data.model,
            code: error.code,
          };
        } else {
          connectionTest = {
            provider: body.data.provider,
            status: "failed",
            ok: false,
            providerStatus: "error",
            latencyMs: null,
            message:
              error instanceof Error
                ? error.message
                : "Provider AI gagal auto-connect.",
            model: body.data.model,
            code: "AI_PROVIDER_AUTO_CONNECT_FAILED",
          };
        }
      }

      providers = await getAiProviderPublicConfigs();
    }
  } catch (error) {
    if (error instanceof GarageAiProviderError) {
      return fail(error.status, error.code, error.message);
    }

    return fail(
      500,
      "AI_PROVIDER_SAVE_FAILED",
      error instanceof Error ? error.message : "Provider AI gagal disimpan.",
    );
  }

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI provider updated",
    object: body.data.provider,
    device: session.data.profile.deviceLabel,
    status: connectionTest?.status === "failed" ? "watch" : "recorded",
    metadata: {
      enabled: body.data.enabled,
      priority: body.data.priority,
      model: body.data.model,
      apiKeyChanged: Boolean(body.data.apiKey?.trim() || body.data.clearApiKey),
      connectionTest: connectionTest
        ? {
            status: connectionTest.status,
            providerStatus: connectionTest.providerStatus,
            latencyMs: connectionTest.latencyMs,
            model: connectionTest.model,
            code: connectionTest.code ?? null,
          }
        : null,
    },
  }).catch(() => undefined);

  return ok({ providers, templates: aiProviderTemplates, connectionTest });
}
