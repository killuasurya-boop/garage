import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

function secret() {
  const value =
    process.env.SOCIAL_PUBLISHER_ENCRYPTION_KEY?.trim() ||
    process.env.AI_CONFIG_ENCRYPTION_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();

  if (!value) {
    throw new Error(
      "SOCIAL_PUBLISHER_ENCRYPTION_KEY atau AI_CONFIG_ENCRYPTION_KEY belum dikonfigurasi.",
    );
  }
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(secret()).digest();
}

export function encryptSocialToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), tag.toString("base64"), payload.toString("base64")].join(
    ":",
  );
}

export function decryptSocialToken(value: string) {
  const [version, ivRaw, tagRaw, payloadRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !payloadRaw) {
    throw new Error("Format token social publisher tidak valid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export type SocialOAuthState = {
  userId: string;
  returnTo: string;
  expiresAt: number;
};

export function signSocialOAuthState(input: Omit<SocialOAuthState, "expiresAt">) {
  const returnTo =
    input.returnTo.startsWith("/") && !input.returnTo.startsWith("//")
      ? input.returnTo
      : "/";
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      returnTo,
      expiresAt: Date.now() + 10 * 60 * 1000,
    } satisfies SocialOAuthState),
  ).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySocialOAuthState(value: string): SocialOAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("State OAuth tidak lengkap.");

  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Signature state OAuth tidak valid.");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SocialOAuthState;
  if (!parsed.userId || !parsed.returnTo || parsed.expiresAt < Date.now()) {
    throw new Error("State OAuth sudah kedaluwarsa atau tidak valid.");
  }
  if (!parsed.returnTo.startsWith("/") || parsed.returnTo.startsWith("//")) {
    throw new Error("Tujuan OAuth tidak valid.");
  }
  return parsed;
}
