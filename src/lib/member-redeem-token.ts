import { createHmac, timingSafeEqual } from "node:crypto";

// =============================================================================
// Pakai poin di kasir wajib scan QR member (owner, Okt 2026). Scan QR di
// /api/pos/member/verify menerbitkan token bertanda tangan yang mengikat
// member + kasir yang memindai. createOrder menolak potongan poin tanpa token
// yang cocok, jadi nomor HP saja tidak cukup untuk memakai poin orang lain.
// =============================================================================

/** Token berlaku 2 jam sejak QR dipindai (cukup untuk satu kunjungan). */
export const MEMBER_REDEEM_TOKEN_TTL_MS = 2 * 60 * 60_000;
/** Order offline boleh tersinkron sampai 3 hari setelah dibuat. */
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60_000;

function secret() {
  return process.env.BETTER_AUTH_SECRET?.trim() || "garage-dev-only-auth-secret";
}

function sign(body: string) {
  return createHmac("sha256", `member-redeem:${secret()}`).update(body).digest("base64url");
}

export function issueMemberRedeemToken(input: { customerId: string; userId: string; now?: number }) {
  const exp = (input.now ?? Date.now()) + MEMBER_REDEEM_TOKEN_TTL_MS;
  const body = Buffer.from(JSON.stringify({ c: input.customerId, u: input.userId, e: exp })).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyMemberRedeemToken(
  token: string | undefined | null,
  expected: { customerId: string; userId: string; now?: number; offlineSync?: boolean },
): boolean {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expectedSig = Buffer.from(sign(body));
  const givenSig = Buffer.from(signature);
  if (expectedSig.length !== givenSig.length || !timingSafeEqual(expectedSig, givenSig)) return false;
  let payload: { c?: unknown; u?: unknown; e?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (payload.c !== expected.customerId || payload.u !== expected.userId || typeof payload.e !== "number") {
    return false;
  }
  // Order dari antrean offline: QR dipindai saat order dibuat, sinkron bisa
  // jauh setelahnya — tetap diterima selama masih dalam jendela offline.
  const grace = expected.offlineSync ? OFFLINE_GRACE_MS : 0;
  return (expected.now ?? Date.now()) <= payload.e + grace;
}

/** Nomor HP bukan bukti kartu member — QR harus berisi id/kode member. */
export function isPhoneLikeMemberIdentifier(payload: string) {
  const trimmed = payload.trim();
  let identifier = trimmed;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { id?: string; code?: string; phone?: string };
      identifier = parsed.id ?? parsed.code ?? parsed.phone ?? "";
    } catch {
      return false;
    }
  }
  return /^\+?\d[\d\s-]{5,}$/.test(identifier.trim());
}
