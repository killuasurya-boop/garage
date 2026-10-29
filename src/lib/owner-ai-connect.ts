// =============================================================================
// Owner AI Connect (blueprint GOS-AI-MCP V3 Phase 1, ADR-013): koneksi ChatGPT milik
// Owner, kode verifikasi sekali pakai, pencabutan, dan status teragregasi.
// - Kode: 8 karakter, hanya hash (terikat Owner) disimpan, TTL 10 menit, maks 5 percobaan.
// - VERIFIED hanya lewat tool garage_verify_connection dari token OAuth Owner yang sama.
// - Cabut: token yang terbit sebelum revoked_at ditolak gateway (JWT tidak bisa ditarik),
//   refresh token klien itu dicabut → ChatGPT harus login + 2FA ulang untuk tersambung lagi.
// Tidak pernah mencatat kode atau token.
// =============================================================================
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiConnections,
  aiVerificationChallenges,
  mcpOperations,
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
  user,
} from "@/db/schema";
import { computeAiStatus, type ConnectionFacts } from "@/lib/owner-ai-status";

export const AI_CHALLENGE_TTL_MS = 10 * 60_000;
export const AI_CHALLENGE_MAX_ATTEMPTS = 5;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // tanpa 0/O/1/I/L

export type AiConnectErrorCode =
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_LOCKED"
  | "INVALID_CODE"
  | "CONNECTION_REVOKED"
  | "NOT_FOUND";

export class AiConnectError extends Error {
  constructor(
    readonly code: AiConnectErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AiConnectError";
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const codeHashFor = (ownerUserId: string, code: string) => sha256(`ai-verify:${ownerUserId}:${code}`);

/** "ab3d-ef9h" / "AB3DEF9H" → "AB3DEF9H" (tanpa pemisah, huruf besar). */
export function normalizeVerificationCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Kode baru untuk Owner; kode aktif sebelumnya otomatis tidak berlaku. Kode hanya dikembalikan sekali. */
export async function createVerificationChallenge(ownerUserId: string, now = new Date()) {
  const code = newCode();
  const expiresAt = new Date(now.getTime() + AI_CHALLENGE_TTL_MS);
  const row = await getDb().transaction(async (tx) => {
    await tx
      .update(aiVerificationChallenges)
      .set({ status: "superseded" })
      .where(and(eq(aiVerificationChallenges.ownerUserId, ownerUserId), eq(aiVerificationChallenges.status, "active")));
    const [inserted] = await tx
      .insert(aiVerificationChallenges)
      .values({ ownerUserId, codeHash: codeHashFor(ownerUserId, code), expiresAt })
      .returning({ id: aiVerificationChallenges.id });
    return inserted;
  });
  return { challengeId: row.id, code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: expiresAt.toISOString() };
}

/**
 * Dipanggil gateway untuk setiap token sah. Mengembalikan koneksi, atau `revoked` bila token
 * terbit sebelum koneksi dicabut. Token yang terbit SETELAH pencabutan = Owner login + 2FA ulang
 * lewat OAuth → koneksi aktif lagi.
 */
export async function touchConnection(input: {
  ownerUserId: string;
  oauthClientId: string;
  /** `iat` token (detik). */
  issuedAt: number | null;
  now?: Date;
}): Promise<{ revoked: true } | { revoked: false; connectionId: string }> {
  const now = input.now ?? new Date();
  const db = getDb();
  const [existing] = await db
    .select({ id: aiConnections.id, revokedAt: aiConnections.revokedAt })
    .from(aiConnections)
    .where(
      and(
        eq(aiConnections.ownerUserId, input.ownerUserId),
        eq(aiConnections.provider, "chatgpt"),
        eq(aiConnections.oauthClientId, input.oauthClientId),
      ),
    )
    .limit(1);

  if (existing?.revokedAt) {
    const issuedMs = input.issuedAt ? input.issuedAt * 1000 : 0;
    if (issuedMs <= existing.revokedAt.getTime()) return { revoked: true };
    await db
      .update(aiConnections)
      .set({ revokedAt: null, revokedBy: null, revokeReason: null, lastSeenAt: now, lastVerifiedAt: null, lastReadOkAt: null, lastWriteOkAt: null })
      .where(eq(aiConnections.id, existing.id));
    return { revoked: false, connectionId: existing.id };
  }
  if (existing) {
    await db.update(aiConnections).set({ lastSeenAt: now }).where(eq(aiConnections.id, existing.id));
    return { revoked: false, connectionId: existing.id };
  }

  const [client] = await db
    .select({ name: oauthClient.name })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, input.oauthClientId))
    .limit(1);
  const [row] = await db
    .insert(aiConnections)
    .values({
      ownerUserId: input.ownerUserId,
      provider: "chatgpt",
      oauthClientId: input.oauthClientId,
      clientName: client?.name ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [aiConnections.ownerUserId, aiConnections.provider, aiConnections.oauthClientId],
      set: { lastSeenAt: now },
    })
    .returning({ id: aiConnections.id });
  return { revoked: false, connectionId: row.id };
}

/** Bukti kemampuan nyata: tool baca/tulis yang benar-benar berhasil dari ChatGPT. */
export async function recordToolSuccess(connectionId: string, kind: "read" | "write", now = new Date()) {
  await getDb()
    .update(aiConnections)
    .set(kind === "write" ? { lastWriteOkAt: now, lastReadOkAt: now } : { lastReadOkAt: now })
    .where(eq(aiConnections.id, connectionId));
}

/** Tool garage_verify_connection: cocokkan kode dengan tantangan aktif Owner pemilik token. */
export async function verifyConnectionChallenge(input: {
  ownerUserId: string;
  connectionId: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const code = normalizeVerificationCode(input.code);
  const result = await getDb().transaction(async (tx) => {
    const [connection] = await tx
      .select({ id: aiConnections.id, revokedAt: aiConnections.revokedAt })
      .from(aiConnections)
      .where(and(eq(aiConnections.id, input.connectionId), eq(aiConnections.ownerUserId, input.ownerUserId)))
      .limit(1);
    if (!connection) throw new AiConnectError("NOT_FOUND", "Koneksi tidak ditemukan.", 404);
    if (connection.revokedAt) throw new AiConnectError("CONNECTION_REVOKED", "Koneksi ini sudah dicabut Owner.", 403);

    const [challenge] = await tx
      .select()
      .from(aiVerificationChallenges)
      .where(and(eq(aiVerificationChallenges.ownerUserId, input.ownerUserId), eq(aiVerificationChallenges.status, "active")))
      .orderBy(desc(aiVerificationChallenges.createdAt))
      .for("update")
      .limit(1);
    if (!challenge) {
      return { error: new AiConnectError("CHALLENGE_NOT_FOUND", "Tidak ada kode verifikasi aktif. Buat kode baru di Garage OS → AI Connect.") };
    }
    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await tx.update(aiVerificationChallenges).set({ status: "expired" }).where(eq(aiVerificationChallenges.id, challenge.id));
      return { error: new AiConnectError("CHALLENGE_EXPIRED", "Kode verifikasi kedaluwarsa (10 menit). Buat kode baru di AI Connect.") };
    }
    const expected = Buffer.from(challenge.codeHash);
    const actual = Buffer.from(codeHashFor(input.ownerUserId, code));
    const match = code.length === 8 && expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!match) {
      const attempts = challenge.attempts + 1;
      const locked = attempts >= AI_CHALLENGE_MAX_ATTEMPTS;
      await tx
        .update(aiVerificationChallenges)
        .set({ attempts, status: locked ? "locked" : "active" })
        .where(eq(aiVerificationChallenges.id, challenge.id));
      return {
        error: locked
          ? new AiConnectError("CHALLENGE_LOCKED", "Terlalu banyak kode salah — kode dikunci. Buat kode baru di AI Connect.", 429)
          : new AiConnectError("INVALID_CODE", `Kode salah. Sisa ${AI_CHALLENGE_MAX_ATTEMPTS - attempts} percobaan.`),
      };
    }
    await tx
      .update(aiVerificationChallenges)
      .set({ status: "verified", consumedAt: now, consumedByConnectionId: connection.id })
      .where(eq(aiVerificationChallenges.id, challenge.id));
    await tx
      .update(aiConnections)
      .set({ lastVerifiedAt: now, verifiedChallengeId: challenge.id, lastReadOkAt: now })
      .where(eq(aiConnections.id, connection.id));
    return { verifiedAt: now, challengeId: challenge.id };
  });
  // Percobaan gagal tetap tercatat (attempts/locked) — error dilempar SETELAH transaksi commit.
  if ("error" in result && result.error) throw result.error;
  return result as { verifiedAt: Date; challengeId: string };
}

/** Cabut satu koneksi atau semua koneksi ChatGPT Owner. Tidak menyentuh data bisnis. */
export async function revokeConnections(input: {
  ownerUserId: string;
  actorUserId: string;
  connectionId?: string;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(aiConnections)
      .set({ revokedAt: now, revokedBy: input.actorUserId, revokeReason: input.reason })
      .where(
        and(
          eq(aiConnections.ownerUserId, input.ownerUserId),
          isNull(aiConnections.revokedAt),
          input.connectionId ? eq(aiConnections.id, input.connectionId) : undefined,
        ),
      )
      .returning({ id: aiConnections.id, oauthClientId: aiConnections.oauthClientId });
    const clientIds = rows.map((r) => r.oauthClientId);
    if (clientIds.length) {
      for (const table of [oauthRefreshToken, oauthAccessToken]) {
        await tx
          .update(table)
          .set({ revoked: now })
          .where(and(eq(table.userId, input.ownerUserId), inArray(table.clientId, clientIds), isNull(table.revoked)));
      }
    }
    return { revokedCount: rows.length, connectionIds: rows.map((r) => r.id) };
  });
}

/** Data mentah + status teragregasi untuk halaman AI Connect & chip navbar. */
export async function loadOwnerAiStatus(input: {
  ownerUserId: string;
  gatewayConfigured: boolean;
  gatewayReason: string | null;
  paused: boolean;
  writeEnabled: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const db = getDb();
  const [owner] = await db
    .select({ twoFactor: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, input.ownerUserId))
    .limit(1);
  const connections: ConnectionFacts[] = await db
    .select({
      id: aiConnections.id,
      clientName: aiConnections.clientName,
      oauthClientId: aiConnections.oauthClientId,
      firstSeenAt: aiConnections.firstSeenAt,
      lastSeenAt: aiConnections.lastSeenAt,
      lastReadOkAt: aiConnections.lastReadOkAt,
      lastWriteOkAt: aiConnections.lastWriteOkAt,
      lastVerifiedAt: aiConnections.lastVerifiedAt,
      revokedAt: aiConnections.revokedAt,
    })
    .from(aiConnections)
    .where(eq(aiConnections.ownerUserId, input.ownerUserId))
    .orderBy(desc(aiConnections.lastSeenAt));
  const [lastOp] = await db
    .select({ status: mcpOperations.status, tool: mcpOperations.tool, at: sql<Date>`coalesce(${mcpOperations.executedAt}, ${mcpOperations.confirmedAt}, ${mcpOperations.createdAt})` })
    .from(mcpOperations)
    .where(and(eq(mcpOperations.userId, input.ownerUserId), inArray(mcpOperations.status, ["confirmed", "executed", "failed"])))
    .orderBy(desc(mcpOperations.createdAt))
    .limit(1);

  const status = computeAiStatus({
    now,
    gatewayConfigured: input.gatewayConfigured,
    gatewayReason: input.gatewayReason,
    paused: input.paused,
    writeEnabled: input.writeEnabled,
    ownerTwoFactor: Boolean(owner?.twoFactor),
    connections,
    lastOperation: lastOp ? { status: lastOp.status, tool: lastOp.tool, at: new Date(lastOp.at) } : null,
  });
  return {
    status,
    connections: connections.map((c) => ({
      id: c.id,
      clientName: c.clientName ?? "ChatGPT",
      // Hanya ujung client id — cukup untuk membedakan, tanpa membocorkan identitas penuh.
      clientRef: `…${c.oauthClientId.slice(-6)}`,
      firstSeenAt: c.firstSeenAt.toISOString(),
      lastSeenAt: c.lastSeenAt.toISOString(),
      lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null,
      lastReadOkAt: c.lastReadOkAt?.toISOString() ?? null,
      lastWriteOkAt: c.lastWriteOkAt?.toISOString() ?? null,
      revokedAt: c.revokedAt?.toISOString() ?? null,
    })),
    dataAsOf: now.toISOString(),
  };
}
