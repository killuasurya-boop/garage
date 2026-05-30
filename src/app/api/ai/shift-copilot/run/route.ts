import { fail, ok } from "@/lib/api-response";
import { runShiftCopilotJob } from "@/lib/garage-ai-shift-copilot";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Supervisor Shift",
  ]);
  if (session.response) {
    return session.response;
  }

  try {
    const result = await runShiftCopilotJob(
      session.data.user.name ?? session.data.user.email,
      session.data.profile.outlet.id,
    );

    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI shift copilot run",
      object: "shift_copilot",
      device: session.data.profile.deviceLabel,
      status: "completed",
      metadata: result,
    }).catch(() => undefined);

    return ok(result);
  } catch (error) {
    return fail(
      500,
      "AI_SHIFT_COPILOT_RUN_FAILED",
      error instanceof Error
        ? error.message
        : "Shift Copilot gagal dijalankan.",
    );
  }
}
