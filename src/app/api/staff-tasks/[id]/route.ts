import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { updateStaffTaskStatus } from "@/lib/garage-staff-tasks";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["acknowledge", "complete", "cancel"]),
  cancellationReason: z.string().trim().max(300).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const { id } = await context.params;
  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;

  const result = await updateStaffTaskStatus({
    taskId: id,
    action: body.data.action,
    actorUserId: session.data.user.id,
    actorRole: session.data.profile.role,
    cancellationReason: body.data.cancellationReason,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return fail(404, "TASK_NOT_FOUND", "Task tidak ditemukan.");
    }
    return fail(403, "FORBIDDEN", "Anda tidak berwenang mengubah task ini.");
  }

  const updated = result.task;

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: `Staff task ${body.data.action}`,
    object: `staff_task:${id}`,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      taskTitle: updated.title,
      targetRole: updated.targetRole,
      source: updated.source,
    },
  }).catch(() => undefined);

  return ok({ task: updated });
}
