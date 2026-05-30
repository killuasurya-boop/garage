import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const POS_LOCK_PIN = "111111";

const unlockSchema = z.object({
  password: z.string().min(1, "PIN wajib diisi."),
});

export async function POST(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, unlockSchema);
  if (body.error) {
    return body.error;
  }

  if (body.data.password.trim() !== POS_LOCK_PIN) {
    return fail(401, "INVALID_PIN", "PIN lock POS tidak cocok.");
  }

  return ok({ status: true });
}
