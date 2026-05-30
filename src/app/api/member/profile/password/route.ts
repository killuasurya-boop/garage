import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { memberAccounts, memberSessions } from "@/db/schema";
import {
  hashPassword,
  requireMemberAuth,
  verifyPassword,
} from "@/lib/member-auth";
import { errorJson, readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const passwordSchema = z.object({
  currentPassword: z.string().min(6, "Password lama minimal 6 karakter."),
  newPassword: z
    .string()
    .min(8, "Password baru minimal 8 karakter.")
    .max(72, "Password baru maksimal 72 karakter."),
});

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "member-profile-password", {
    limit: 8,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await requireMemberAuth(request);
  if (session.response) return session.response;

  const parsed = await readMemberJson(request, passwordSchema);
  if (parsed.response) return parsed.response;

  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return errorJson(400, "Password baru harus berbeda dari password lama.");
  }

  const valid = await verifyPassword(
    currentPassword,
    session.data.account.passwordHash,
  );
  if (!valid) {
    return errorJson(403, "Password lama tidak sesuai.");
  }

  const db = getDb();
  await db
    .update(memberAccounts)
    .set({
      passwordHash: await hashPassword(newPassword),
      updatedAt: new Date(),
    })
    .where(eq(memberAccounts.id, session.data.account.id));

  await db
    .update(memberSessions)
    .set({ updatedAt: new Date() })
    .where(eq(memberSessions.accountId, session.data.account.id));

  return successJson({ updated: true });
}
