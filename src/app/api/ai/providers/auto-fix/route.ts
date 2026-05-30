import { fail, ok } from "@/lib/api-response";
import { autoFixAiProviderConfigs } from "@/lib/garage-ai-providers";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  try {
    const result = await autoFixAiProviderConfigs();

    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI provider auto fix",
      object: "ai_provider_configs",
      device: session.data.profile.deviceLabel,
      status: result.fixes.some((fix) => fix.status === "completed")
        ? "completed"
        : "recorded",
      metadata: {
        fixes: result.fixes,
      },
    }).catch(() => undefined);

    return ok(result);
  } catch (error) {
    return fail(
      500,
      "AI_PROVIDER_AUTO_FIX_FAILED",
      error instanceof Error
        ? error.message
        : "Auto Fix Provider gagal dijalankan.",
    );
  }
}
