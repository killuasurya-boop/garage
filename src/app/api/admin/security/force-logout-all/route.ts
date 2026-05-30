import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { auditLogs } from "@/db/schema";
import { getDb } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { forceLogoutAll } from "@/lib/garage-security-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  preserveSelf: z.boolean().default(true),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;

  const result = await forceLogoutAll(
    parsed.data.preserveSelf ? session.data.user.id : undefined,
  );

  try {
    await getDb().insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: session.data.user.name,
      action: "security.force_logout_all",
      object: parsed.data.preserveSelf ? "all_except_self" : "all_users",
      device: session.data.profile.deviceLabel,
      status: "ok",
      metadata: {
        actorUserId: session.data.user.id,
        revoked: result.revoked,
        reason: parsed.data.reason,
      },
    });
  } catch {
    // audit gak boleh block
  }

  return ok(result);
}
