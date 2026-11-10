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
  // Kosong hanya boleh untuk akun Google yang belum pernah membuat PIN (pin_set_at null).
  currentPassword: z.string().min(6, "Password lama minimal 6 karakter.").optional(),
  newPassword: z
    .string()
    .min(6, "PIN/password baru minimal 6 karakter.")
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
  const account = session.data.account;
  // Buat PIN pertama: hanya akun dari Google yang PIN-nya masih acak buatan server.
  const firstPin = !account.pinSetAt && Boolean(account.googleSub);
  if (!firstPin) {
    if (!currentPassword) return errorJson(400, "Password lama wajib diisi.");
    if (currentPassword === newPassword) {
      return errorJson(400, "Password baru harus berbeda dari password lama.");
    }
    const valid = await verifyPassword(currentPassword, account.passwordHash);
    if (!valid) {
      return errorJson(403, "Password lama tidak sesuai.");
    }
  }

  const db = getDb();
  await db
    .update(memberAccounts)
    .set({
      passwordHash: await hashPassword(newPassword),
      pinSetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memberAccounts.id, session.data.account.id));

  await db
    .update(memberSessions)
    .set({ updatedAt: new Date() })
    .where(eq(memberSessions.accountId, session.data.account.id));

  return successJson({ updated: true });
}
