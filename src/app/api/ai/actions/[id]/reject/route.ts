import { fail, ok } from "@/lib/api-response";
import { decideAiActionDraft } from "@/lib/garage-ai-agents";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const action = await decideAiActionDraft({
    id,
    status: "rejected",
    session: session.data,
  });

  if (!action) {
    return fail(404, "AI_ACTION_NOT_FOUND", "Action draft tidak ditemukan.");
  }

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI action rejected",
    object: action.actionType,
    device: session.data.profile.deviceLabel,
    status: "rejected",
    metadata: {
      actionId: action.id,
      runId: action.runId,
      safetyLevel: action.safetyLevel,
      riskLevel: action.riskLevel,
    },
  }).catch(() => undefined);

  return ok({ action });
}
