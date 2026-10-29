import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Owner AI Connect (blueprint V3 AC-02/03/04): kode sekali pakai, salah/expired/replay/
// brute force/Owner lain ditolak, cabut koneksi menolak token lama & mencabut refresh token.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let ai: typeof import("@/lib/owner-ai-connect");
const OWNER = "user-ai-owner";
const OTHER = "user-ai-other-owner";

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: OWNER });
  await t.getDb().insert(t.schema.user).values({ id: OTHER, name: "Owner Lain", email: `${OTHER}@garage.id` });
  ai = await import("@/lib/owner-ai-connect");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

const nowSec = () => Math.floor(Date.now() / 1000);

async function connect(owner: string, clientId: string) {
  const r = await ai.touchConnection({ ownerUserId: owner, oauthClientId: clientId, issuedAt: nowSec() });
  if (r.revoked) throw new Error("unexpected revoked");
  return r.connectionId;
}

describe("kode verifikasi", () => {
  it("format XXXX-XXXX, hanya hash yang disimpan", async () => {
    const { code } = await ai.createVerificationChallenge(OWNER);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const rows = await t.getDb().select().from(t.schema.aiVerificationChallenges);
    expect(JSON.stringify(rows)).not.toContain(code.replace("-", ""));
  });

  it("kode benar dari Owner yang sama → VERIFIED sekali; dipakai ulang ditolak", async () => {
    const conn = await connect(OWNER, "client-A");
    const { code } = await ai.createVerificationChallenge(OWNER);
    const ok = await ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code: code.toLowerCase() });
    expect(ok.verifiedAt).toBeInstanceOf(Date);
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code })).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });

  it("kode Owner A tidak bisa dipakai token Owner B (koneksi B tidak punya tantangan)", async () => {
    const connB = await connect(OTHER, "client-B");
    const { code } = await ai.createVerificationChallenge(OWNER);
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OTHER, connectionId: connB, code })).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
    // Owner B juga tidak bisa memakai koneksi milik Owner A.
    const connA = await connect(OWNER, "client-A");
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OTHER, connectionId: connA, code })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("kode lama tidak berlaku setelah kode baru dibuat", async () => {
    const conn = await connect(OWNER, "client-A");
    const first = await ai.createVerificationChallenge(OWNER);
    await ai.createVerificationChallenge(OWNER);
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code: first.code })).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("5 kode salah → dikunci (kode benar pun ditolak); percobaan tercatat walau error", async () => {
    const conn = await connect(OWNER, "client-A");
    const { code } = await ai.createVerificationChallenge(OWNER);
    for (let i = 1; i <= 4; i += 1) {
      await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code: "ZZZZ-ZZZZ" })).rejects.toMatchObject({
        code: "INVALID_CODE",
        message: expect.stringContaining(`Sisa ${5 - i}`),
      });
    }
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code: "ZZZZ-ZZZZ" })).rejects.toMatchObject({ code: "CHALLENGE_LOCKED" });
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code })).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });

  it("kode kedaluwarsa (10 menit) ditolak", async () => {
    const conn = await connect(OWNER, "client-A");
    const past = new Date(Date.now() - 11 * 60_000);
    const { code } = await ai.createVerificationChallenge(OWNER, past);
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code })).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });
});

describe("cabut koneksi", () => {
  it("token lama ditolak, refresh token dicabut; OAuth ulang (token lebih baru) aktif lagi tanpa status verified", async () => {
    const d = t.getDb();
    const conn = await connect(OWNER, "client-R");
    const { code } = await ai.createVerificationChallenge(OWNER);
    await ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code });

    await d.insert(t.schema.oauthClient).values({ id: "oc-r", clientId: "client-R", name: "ChatGPT", redirectUris: ["https://chatgpt.com/connector/oauth/cb"] } as any);
    await d.insert(t.schema.oauthRefreshToken).values({ id: "rt-r", token: "rt-hash", clientId: "client-R", userId: OWNER, scopes: ["garage:owner"], expiresAt: new Date(Date.now() + 86_400_000) } as any);

    const issuedBefore = nowSec() - 5;
    const result = await ai.revokeConnections({ ownerUserId: OWNER, actorUserId: OWNER, connectionId: conn, reason: "uji" });
    expect(result.revokedCount).toBe(1);
    const [rt] = await d.select().from(t.schema.oauthRefreshToken);
    expect(rt.revoked).toBeInstanceOf(Date);

    expect(await ai.touchConnection({ ownerUserId: OWNER, oauthClientId: "client-R", issuedAt: issuedBefore })).toEqual({ revoked: true });
    await expect(ai.verifyConnectionChallenge({ ownerUserId: OWNER, connectionId: conn, code: "AAAA-AAAA" })).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });

    const again = await ai.touchConnection({ ownerUserId: OWNER, oauthClientId: "client-R", issuedAt: nowSec() + 2 });
    expect(again).toEqual({ revoked: false, connectionId: conn });
    const status = await ai.loadOwnerAiStatus({ ownerUserId: OWNER, gatewayConfigured: true, gatewayReason: null, paused: false, writeEnabled: true });
    expect(status.connections.find((c) => c.id === conn)).toMatchObject({ revokedAt: null, lastVerifiedAt: null });
  });

  it("cabut semua tidak menyentuh koneksi Owner lain; status tidak membocorkan client id penuh", async () => {
    await connect(OTHER, "client-other-xyz");
    await ai.revokeConnections({ ownerUserId: OWNER, actorUserId: OWNER, reason: "darurat" });
    const mine = await ai.loadOwnerAiStatus({ ownerUserId: OWNER, gatewayConfigured: true, gatewayReason: null, paused: false, writeEnabled: true });
    expect(mine.connections.every((c) => c.revokedAt)).toBe(true);
    expect(mine.status.link.state).toBe("REVOKED");
    const other = await ai.loadOwnerAiStatus({ ownerUserId: OTHER, gatewayConfigured: true, gatewayReason: null, paused: false, writeEnabled: true });
    expect(other.connections.every((c) => !c.revokedAt)).toBe(true);
    expect(JSON.stringify(other)).not.toContain("client-other-xyz");
  });
});
