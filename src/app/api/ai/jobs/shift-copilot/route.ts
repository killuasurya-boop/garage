import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { outlets } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { runShiftCopilotJob } from "@/lib/garage-ai-shift-copilot";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const [outlet] = await getDb()
      .select({ id: outlets.id })
      .from(outlets)
      .where(eq(outlets.status, "active"))
      .limit(1);
    const result = await runShiftCopilotJob("GARAGE AI Cron", outlet?.id ?? null);
    return ok({
      job: "shift-copilot",
      ...result,
    });
  } catch (error) {
    return fail(
      500,
      "AI_SHIFT_COPILOT_JOB_FAILED",
      error instanceof Error
        ? error.message
        : "GARAGE AI Shift Copilot job gagal.",
    );
  }
}
