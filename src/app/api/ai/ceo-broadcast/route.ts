import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { runCeoBroadcast } from "@/lib/garage-ai-ceo-broadcast";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ceoBroadcastSchema = z.object({
  focus: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) return session.response;

  const body = await readJson(request, ceoBroadcastSchema);
  if (body.error) return body.error;

  const report = await runCeoBroadcast({
    session: session.data,
    focus: body.data.focus,
  });

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "Garage CEO AI broadcast dijalankan",
    object: "ai_ceo_broadcast",
    device: session.data.profile.deviceLabel,
    status: report.errors.length ? "warning" : "recorded",
    metadata: {
      focus: body.data.focus ?? null,
      posted: report.posted.length,
      skipped: report.skipped.length,
      errors: report.errors.length,
      actionDraftsCreated: report.actionDraftsCreated,
      providerUsed: report.providerUsed,
      modelUsed: report.modelUsed,
    },
  }).catch(() => undefined);

  return ok(report);
}
