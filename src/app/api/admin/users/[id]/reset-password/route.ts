import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { resetUserPassword } from "@/lib/admin-user-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  newPassword: z.string().min(8, "Password minimal 8 karakter"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;

  const result = await resetUserPassword(id, parsed.data.newPassword, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    deviceLabel: session.data.profile.deviceLabel,
  });
  if ("error" in result) {
    return fail(400, "RESET_PASSWORD_FAILED", result.error);
  }

  return ok({ reset: true });
}
