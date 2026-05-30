import { fail, ok } from "@/lib/api-response";
import { maybeCleanupGarageAiLogs } from "@/lib/garage-ai-log-retention";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await maybeCleanupGarageAiLogs({
      actor: "GARAGE AI Cron",
      device: "system-cron",
    });

    return ok({
      job: "log-cleanup",
      result,
    });
  } catch (error) {
    return fail(
      500,
      "AI_LOG_CLEANUP_JOB_FAILED",
      error instanceof Error ? error.message : "GARAGE AI log cleanup job gagal.",
    );
  }
}
