import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { stepUpChallenges, twoFactor, user } from "@/db/schema";
import { auth } from "@/lib/auth";

// =============================================================================
// Step-up 2FA (TOTP) untuk aksi kritis: final closing Owner (B4, PRD §13.3) dan aksi R3
// lewat MCP ChatGPT (D-01a).
// - Tantangan terikat pengguna + tujuan + subjek + hash ringkasan data; nonce sekali pakai
//   (hanya hash yang disimpan); kedaluwarsa pendek.
// - Data berubah setelah tantangan dibuat → STALE (persetujuan lama tidak berlaku).
// - Kode TOTP yang sudah dipakai tidak bisa diputar ulang (hash kode disimpan).
// - Kode & secret TOTP tidak pernah dicatat di log/audit.
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const STEP_UP_TTL_MS = 5 * 60_000;
/** Kode yang sama dari pengguna yang sama ditolak dalam jendela ini (≥ masa berlaku TOTP ±1 langkah). */
const CODE_REPLAY_WINDOW_MS = 3 * 60_000;

export type StepUpErrorCode =
  | "TOTP_NOT_ENABLED"
  | "INVALID_CODE"
  | "CODE_REUSED"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USED"
  | "STALE";

const MESSAGES: Record<StepUpErrorCode, string> = {
  TOTP_NOT_ENABLED: "Aktifkan 2FA (aplikasi authenticator) di akun Anda dulu.",
  INVALID_CODE: "Kode 2FA salah. Ketik 6 angka terbaru dari aplikasi authenticator.",
  CODE_REUSED: "Kode 2FA ini sudah dipakai. Tunggu kode berikutnya di aplikasi authenticator.",
  CHALLENGE_NOT_FOUND: "Sesi persetujuan tidak ditemukan. Buka ulang ringkasannya.",
  CHALLENGE_EXPIRED: "Sesi persetujuan kedaluwarsa (5 menit). Buka ulang ringkasannya.",
  CHALLENGE_USED: "Sesi persetujuan ini sudah dipakai. Buka ulang ringkasannya.",
  STALE: "Data berubah sejak ringkasan dibuka. Periksa ringkasan terbaru lalu setujui lagi.",
};

export class StepUpError extends Error {
  readonly status: number;
  constructor(
    readonly code: StepUpErrorCode,
    message = MESSAGES[code],
  ) {
    super(message);
    this.name = "StepUpError";
    this.status = code === "STALE" || code === "CHALLENGE_USED" ? 409 : code === "TOTP_NOT_ENABLED" ? 403 : 400;
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

/** Hash stabil (urutan key tidak berpengaruh) dari ringkasan yang ditampilkan ke penyetuju. */
export function summaryHashOf(summary: unknown): string {
  return sha256(JSON.stringify(canonical(summary)));
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createStepUpChallenge(
  input: { userId: string; purpose: string; subjectId: string; summaryHash: string },
  db: Db | Tx = getDb(),
  /** Pakai nonce yang sudah dimiliki pemanggil (mis. token konfirmasi MCP); default acak. */
  existingNonce?: string,
) {
  const nonce = existingNonce ?? randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);
  const [row] = await db
    .insert(stepUpChallenges)
    .values({ ...input, nonceHash: sha256(nonce), expiresAt })
    .returning({ id: stepUpChallenges.id });
  return { challengeId: row.id, nonce, expiresAt: expiresAt.toISOString() };
}

/** Verifikasi kode TOTP pengguna (secret dari plugin twoFactor Better Auth). */
export async function verifyUserTotp(userId: string, code: string, db: Db | Tx = getDb()) {
  const [row] = await db
    .select({ secret: twoFactor.secret, verified: twoFactor.verified, enabled: user.twoFactorEnabled })
    .from(twoFactor)
    .innerJoin(user, eq(user.id, twoFactor.userId))
    .where(eq(twoFactor.userId, userId))
    .limit(1);
  if (!row || !row.enabled || row.verified === false) throw new StepUpError("TOTP_NOT_ENABLED");
  if (!/^\d{6}$/.test(code)) return false;
  const ctx = await auth.$context;
  const secret = await symmetricDecrypt({ key: ctx.secretConfig, data: row.secret });
  return createOTP(secret, { period: 30, digits: 6 }).verify(code);
}

/**
 * Pakai tantangan (sekali) setelah kode TOTP valid. Panggil di dalam transaksi yang juga
 * menulis aksi kritisnya, dengan `summaryHash` yang DIHITUNG ULANG dari data terkunci.
 */
export async function consumeStepUpChallenge(
  tx: Tx,
  input: {
    /** Tanpa ID (mis. MCP): tantangan terbaru untuk pengguna + tujuan + subjek. */
    challengeId?: string;
    nonce: string;
    userId: string;
    purpose: string;
    subjectId: string;
    summaryHash: string;
    code: string;
  },
) {
  const code = input.code.trim();
  const [challenge] = await tx
    .select()
    .from(stepUpChallenges)
    .where(
      input.challengeId
        ? eq(stepUpChallenges.id, input.challengeId)
        : and(
            eq(stepUpChallenges.userId, input.userId),
            eq(stepUpChallenges.purpose, input.purpose),
            eq(stepUpChallenges.subjectId, input.subjectId),
          ),
    )
    .orderBy(desc(stepUpChallenges.createdAt))
    .for("update")
    .limit(1);
  if (
    !challenge ||
    challenge.userId !== input.userId ||
    challenge.purpose !== input.purpose ||
    challenge.subjectId !== input.subjectId ||
    !sameHash(challenge.nonceHash, sha256(input.nonce))
  ) {
    throw new StepUpError("CHALLENGE_NOT_FOUND");
  }
  if (challenge.usedAt) throw new StepUpError("CHALLENGE_USED");
  if (challenge.expiresAt.getTime() <= Date.now()) throw new StepUpError("CHALLENGE_EXPIRED");
  if (!sameHash(challenge.summaryHash, input.summaryHash)) throw new StepUpError("STALE");

  const codeHash = sha256(`${input.userId}:${code}`);
  const [reused] = await tx
    .select({ id: stepUpChallenges.id })
    .from(stepUpChallenges)
    .where(
      and(
        eq(stepUpChallenges.userId, input.userId),
        eq(stepUpChallenges.codeHash, codeHash),
        isNotNull(stepUpChallenges.usedAt),
        gt(stepUpChallenges.usedAt, new Date(Date.now() - CODE_REPLAY_WINDOW_MS)),
      ),
    )
    .limit(1);
  if (reused) throw new StepUpError("CODE_REUSED");

  if (!(await verifyUserTotp(input.userId, code, tx))) throw new StepUpError("INVALID_CODE");

  const [claimed] = await tx
    .update(stepUpChallenges)
    .set({ usedAt: new Date(), codeHash })
    .where(and(eq(stepUpChallenges.id, challenge.id), isNull(stepUpChallenges.usedAt)))
    .returning({ id: stepUpChallenges.id });
  if (!claimed) throw new StepUpError("CHALLENGE_USED");
}
