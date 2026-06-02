import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { setStaffPin } from "@/lib/admin-user-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  pinCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN harus 4-8 digit angka")
    .nullable(),
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

  const result = await setStaffPin(id, parsed.data.pinCode, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    actorRole: session.data.profile.role,
    deviceLabel: session.data.profile.deviceLabel,
  });
  if ("error" in result) {
    return fail(400, "SET_PIN_FAILED", result.error);
  }

  return ok({ pinConfigured: Boolean(parsed.data.pinCode) });
}
