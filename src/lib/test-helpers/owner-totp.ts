import { createOTP } from "@better-auth/utils/otp";
import { symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import type { GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Tes: aktifkan 2FA (TOTP) untuk pengguna dan buat kode valid, seperti aplikasi authenticator.
const secretOf = (userId: string) => `totp-secret-${userId}`.padEnd(32, "x");

export async function enableTestTotp(t: GarageTestDb, userId: string) {
  const { auth } = await import("@/lib/auth");
  const ctx = await auth.$context;
  const db = t.getDb();
  await db.update(t.schema.user).set({ twoFactorEnabled: true } as never).where(eq(t.schema.user.id, userId));
  await db
    .insert(t.schema.twoFactor)
    .values({
      id: `tf-${userId}`,
      userId,
      secret: await symmetricEncrypt({ key: ctx.secretConfig, data: secretOf(userId) }),
      backupCodes: await symmetricEncrypt({ key: ctx.secretConfig, data: "[]" }),
      verified: true,
    } as never)
    .onConflictDoNothing();
}

/**
 * Kode TOTP saat ini. Jejak anti-replay pengguna dibersihkan dulu, karena tes memakai
 * kode yang sama berkali-kali dalam satu jendela 30 detik (replay diuji tersendiri).
 */
export async function freshTotpCode(t: GarageTestDb, userId: string) {
  await t
    .getDb()
    .update(t.schema.stepUpChallenges)
    .set({ codeHash: null })
    .where(eq(t.schema.stepUpChallenges.userId, userId));
  return createOTP(secretOf(userId), { period: 30, digits: 6 }).totp();
}
