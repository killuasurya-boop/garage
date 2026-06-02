import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { account, staffProfiles } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Password lama wajib diisi."),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter."),
});

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return fail(400, "PASSWORD_REUSED", "Password baru harus berbeda dari password lama.");
  }

  const db = getDb();
  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, session.data.user.id), eq(account.providerId, "credential")))
    .limit(1);

  if (!credential?.password) {
    return fail(400, "CREDENTIAL_NOT_FOUND", "Akun credential tidak ditemukan.");
  }

  const ctx = await auth.$context;
  const valid = await ctx.password.verify({
    hash: credential.password,
    password: parsed.data.currentPassword,
  });
  if (!valid) {
    return fail(403, "CURRENT_PASSWORD_INVALID", "Password lama tidak sesuai.");
  }

  const hash = await ctx.password.hash(parsed.data.newPassword);
  await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(account.id, credential.id));
  await db
    .update(staffProfiles)
    .set({ passwordResetRequired: false, updatedAt: new Date() })
    .where(eq(staffProfiles.userId, session.data.user.id));

  return ok({ changed: true });
}
