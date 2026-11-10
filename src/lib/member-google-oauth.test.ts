import { createSign, generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildGoogleAuthorization,
  googleConfig,
  openCookieValue,
  pkceChallenge,
  readGoogleState,
  resetGoogleJwksCache,
  safeNextPath,
  sealCookieValue,
  verifyGoogleIdToken,
} from "@/lib/member-google-oauth";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const fetchJwks = (async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as unknown as typeof fetch;

function idToken(claims: Record<string, unknown>, kid = "k1") {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createSign("RSA-SHA256").update(`${header}.${body}`).sign(privateKey).toString("base64url");
  return `${header}.${body}.${sig}`;
}

const now = Date.UTC(2026, 10, 9, 8, 0, 0);
const base = {
  iss: "https://accounts.google.com",
  aud: "client-123",
  sub: "google-sub-1",
  email: "Raka@Example.com",
  email_verified: true,
  name: "Raka Pratama",
  picture: "https://lh3.googleusercontent.com/a/x",
  nonce: "n-1",
  exp: Math.floor(now / 1000) + 600,
};

describe("Google OAuth member — konfigurasi & PKCE", () => {
  it("nonaktif bila Client ID/secret/base URL belum diisi", () => {
    expect(googleConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleConfig({ MEMBER_GOOGLE_CLIENT_ID: "a", MEMBER_GOOGLE_CLIENT_SECRET: "b" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(
      googleConfig({ MEMBER_GOOGLE_CLIENT_ID: "a", MEMBER_GOOGLE_CLIENT_SECRET: "b", BETTER_AUTH_URL: "https://garagecoffee.id/" } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ clientId: "a", clientSecret: "b", redirectUri: "https://garagecoffee.id/api/member/auth/google/callback" });
    // Fallback ke OAuth client integrasi Drive yang sudah ada.
    expect(
      googleConfig({ GOOGLE_OAUTH_CLIENT_ID: "drive-id", GOOGLE_OAUTH_CLIENT_SECRET: "drive-secret", BETTER_AUTH_URL: "https://garagecoffee.id" } as unknown as NodeJS.ProcessEnv)?.clientId,
    ).toBe("drive-id");
  });

  it("URL otorisasi: code + S256 + scope minimal + state cocok dengan cookie", () => {
    const auth = buildGoogleAuthorization({ clientId: "c", clientSecret: "s", redirectUri: "https://x/cb" }, "/order?table=07");
    const url = new URL(auth.url);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = readGoogleState(auth.cookie, url.searchParams.get("state"));
    expect(state?.next).toBe("/order?table=07");
    expect(pkceChallenge(state!.verifier)).toBe(url.searchParams.get("code_challenge"));
    expect(readGoogleState(auth.cookie, "state-lain")).toBeNull();
  });

  it("cookie bertanda tangan menolak perubahan & kedaluwarsa", () => {
    const value = sealCookieValue("state", { a: 1 }, 60, now);
    expect(openCookieValue("state", value, now)).toMatchObject({ a: 1 });
    expect(openCookieValue("pending", value, now)).toBeNull();
    expect(openCookieValue("state", value.replace(/.$/, value.endsWith("A") ? "B" : "A"), now)).toBeNull();
    expect(openCookieValue("state", value, now + 61_000)).toBeNull();
  });

  it("tujuan kembali hanya path internal", () => {
    expect(safeNextPath("/member")).toBe("/member");
    expect(safeNextPath("//evil.com")).toBe("/member");
    expect(safeNextPath("https://evil.com")).toBe("/member");
    expect(safeNextPath("/\\evil.com")).toBe("/member");
    expect(safeNextPath("/api/member/auth/logout")).toBe("/member");
  });
});

describe("Google OAuth member — endpoint uji", () => {
  it("override endpoint hanya di luar produksi dan hanya ke localhost", async () => {
    const { googleEndpoints } = await import("@/lib/member-google-oauth");
    const dev = { NODE_ENV: "development", MEMBER_GOOGLE_TEST_ENDPOINT: "http://127.0.0.1:3199" } as unknown as NodeJS.ProcessEnv;
    expect(googleEndpoints(dev).token).toBe("http://127.0.0.1:3199/token");
    expect(googleEndpoints({ ...dev, NODE_ENV: "production" } as NodeJS.ProcessEnv).token).toBe("https://oauth2.googleapis.com/token");
    expect(googleEndpoints({ ...dev, MEMBER_GOOGLE_TEST_ENDPOINT: "https://evil.example" } as NodeJS.ProcessEnv).auth).toContain("accounts.google.com");
  });
});

describe("Google OAuth member — verifikasi ID token", () => {
  beforeEach(() => resetGoogleJwksCache());
  const opts = { clientId: "client-123", nonce: "n-1", now, fetchImpl: fetchJwks };

  it("token sah → identitas dengan email lowercase", async () => {
    const identity = await verifyGoogleIdToken(idToken(base), opts);
    expect(identity).toMatchObject({ sub: "google-sub-1", email: "raka@example.com", emailVerified: true, name: "Raka Pratama" });
  });

  it.each([
    ["aud lain", { aud: "client-lain" }, "TOKEN_AUDIENCE"],
    ["issuer palsu", { iss: "https://evil.example" }, "TOKEN_ISSUER"],
    ["nonce beda", { nonce: "n-2" }, "TOKEN_NONCE"],
    ["kedaluwarsa", { exp: Math.floor(now / 1000) - 3600 }, "TOKEN_EXPIRED"],
  ])("ditolak: %s", async (_label, patch, code) => {
    await expect(verifyGoogleIdToken(idToken({ ...base, ...patch }), opts)).rejects.toMatchObject({ code });
  });

  it("tanda tangan dipalsukan / kid tak dikenal ditolak", async () => {
    const token = idToken(base);
    const [h, , s] = token.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...base, sub: "orang-lain" })).toString("base64url")}.${s}`;
    await expect(verifyGoogleIdToken(forged, opts)).rejects.toMatchObject({ code: "TOKEN_SIGNATURE" });
    await expect(verifyGoogleIdToken(idToken(base, "k-x"), opts)).rejects.toMatchObject({ code: "TOKEN_KEY" });
  });
});
