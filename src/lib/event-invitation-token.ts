import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// =============================================================================
// Token undangan pribadi: 32 karakter huruf+angka acak (~190 bit, tidak bisa
// ditebak; tanpa "_"/"-" supaya format teks WhatsApp tidak merusak link). DB menyimpan sha256 untuk lookup + salinan terenkripsi AES-256-GCM
// (kunci diturunkan dari BETTER_AUTH_SECRET) supaya admin bisa menyalin ulang
// link tanpa token mentah tersimpan polos. Token tidak pernah ditulis ke log.
// =============================================================================

// Token lama (base64url) boleh mengandung "_"/"-" — tetap diterima.
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 32;

/** 32 karakter base62 tanpa bias (rejection sampling: byte ≥ 248 dibuang). */
function randomAlphanumeric(length: number) {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < 248 && out.length < length) out += TOKEN_ALPHABET[byte % 62];
    }
  }
  return out;
}

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("BETTER_AUTH_SECRET belum diatur — token undangan tidak bisa dibuat.");
  }
  return Buffer.from(hkdfSync("sha256", secret, "garage-event-invitation", "token-enc-v1", 32));
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptInvitationToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decryptInvitationToken(payload: string) {
  const [version, iv, tag, body] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Format token terenkripsi tidak dikenal.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export function generateInvitationToken() {
  const token = randomAlphanumeric(TOKEN_LENGTH);
  return {
    token,
    tokenHash: hashInvitationToken(token),
    tokenEnc: encryptInvitationToken(token),
    // Referensi pendek untuk tampilan admin (bukan bagian yang cukup untuk menebak token).
    tokenRef: token.slice(0, 6),
  };
}
