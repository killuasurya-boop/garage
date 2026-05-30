import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  cleanupGarageAiLogs,
  garageAiLogRetentionPolicy,
} from "@/lib/garage-ai-log-retention";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const cleanupSchema = z.object({
  retentionDays: z.number().int().min(3).max(365).optional(),
});

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  return ok({
    policy: garageAiLogRetentionPolicy(),
  });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, cleanupSchema);
  if (body.error) {
    return body.error;
  }

  try {
    const result = await cleanupGarageAiLogs({
      retentionDays: body.data.retentionDays,
      actor: session.data.user.name ?? session.data.user.email,
      device: session.data.profile.deviceLabel,
      reason: "manual",
    });

    return ok({
      policy: garageAiLogRetentionPolicy(),
      result,
    });
  } catch (error) {
    return fail(
      500,
      "AI_LOG_CLEANUP_FAILED",
      error instanceof Error ? error.message : "GARAGE AI log cleanup failed.",
    );
  }
}
