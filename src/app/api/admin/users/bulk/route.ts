import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { bulkAction } from "@/lib/admin-user-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  userIds: z.array(z.string()).min(1, "Pilih minimal 1 user"),
  action: z.enum(["suspend", "activate", "delete", "force_logout"]),
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

  if (parsed.data.userIds.includes(session.data.user.id) && parsed.data.action !== "activate") {
    return fail(
      400,
      "CANNOT_AFFECT_SELF",
      "Tidak bisa melakukan aksi destruktif terhadap akun sendiri.",
    );
  }

  const result = await bulkAction(parsed.data, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    deviceLabel: session.data.profile.deviceLabel,
  });
  return ok(result);
}
