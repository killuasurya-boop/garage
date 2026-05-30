import { fail, ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { runGarageAiSystemDoctor } from "@/lib/garage-ai-system-doctor";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const result = await runGarageAiSystemDoctor({
      autoHeal: true,
      actor: "GARAGE AI Cron",
      device: "system-cron",
    });

    return ok({
      job: "system-doctor",
      healed: result.fixes.some((fix) => fix.status === "completed"),
      status: result.status,
      score: result.score,
      issueCount: result.issues.length,
      fixCount: result.fixes.length,
      generatedAt: result.generatedAt,
      result,
    });
  } catch (error) {
    return fail(
      500,
      "AI_SYSTEM_DOCTOR_JOB_FAILED",
      error instanceof Error
        ? error.message
        : "GARAGE AI System Doctor job gagal.",
    );
  }
}
