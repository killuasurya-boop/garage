import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { account } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { APPROVAL_PIN_POLICY, guardLockedFor, guardRecordFail, guardReset, lockedMessage } from "@/lib/pin-guard";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const unlockSchema = z.object({
  password: z.string().min(1, "Password wajib diisi.").max(200),
});

/**
 * Buka layar kunci POS dengan PASSWORD AKUN yang sedang login (owner, Okt 2026).
 * Dulu memakai PIN tetap "111111" yang sama untuk semua tablet.
 * 5 kali salah / 15 menit → dikunci 15 menit.
 */
export async function POST(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, unlockSchema);
  if (body.error) {
    return body.error;
  }

  const limitKey = `pos-unlock:${session.data.user.id}`;
  const lockedFor = guardLockedFor(limitKey);
  if (lockedFor) {
    return fail(429, "TOO_MANY_ATTEMPTS", lockedMessage(lockedFor));
  }

  const [credential] = await getDb()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, session.data.user.id), eq(account.providerId, "credential")))
    .limit(1);
  const ctx = await auth.$context;
  const valid = credential?.password
    ? await ctx.password.verify({ hash: credential.password, password: body.data.password })
    : false;

  if (!valid) {
    guardRecordFail(limitKey, APPROVAL_PIN_POLICY);
    return fail(401, "INVALID_PASSWORD", "Password akun tidak cocok.");
  }

  guardReset(limitKey);
  return ok({ status: true });
}
