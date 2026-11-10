// =============================================================================
// Login member dengan Google (Crystal V5, Owner Nov 2026). OAuth 2.0 authorization code + PKCE (S256),
// state + nonce di cookie bertanda tangan HMAC (HttpOnly, 10 menit), ID token diverifikasi di server
// (tanda tangan RS256 vs JWKS Google, iss, aud, exp, nonce, email_verified). Scope minimal: openid email profile.
// Aktif hanya bila MEMBER_GOOGLE_CLIENT_ID + MEMBER_GOOGLE_CLIENT_SECRET diset; tanpa itu tombol tidak tampil.
// Rahasia/kode/token TIDAK pernah ditulis ke log.
// =============================================================================
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify, type JsonWebKey } from "node:crypto";

import { memberAuthSecret } from "@/lib/member-auth";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/**
 * Endpoint Google. Hanya untuk uji E2E (server lokal yang meniru Google), base bisa diganti lewat
 * MEMBER_GOOGLE_TEST_ENDPOINT — diabaikan total di produksi, jadi tidak bisa dipakai mengalihkan login asli.
 */
export function googleEndpoints(env: NodeJS.ProcessEnv = process.env) {
  const testBase = env.NODE_ENV !== "production" ? env.MEMBER_GOOGLE_TEST_ENDPOINT?.trim().replace(/\/+$/, "") : "";
  if (testBase && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(testBase)) {
    return { auth: `${testBase}/authorize`, token: `${testBase}/token`, jwks: `${testBase}/jwks` };
  }
  return { auth: GOOGLE_AUTH_URL, token: GOOGLE_TOKEN_URL, jwks: GOOGLE_JWKS_URL };
}

export const GOOGLE_STATE_COOKIE = "garage_member_google";
export const GOOGLE_PENDING_COOKIE = "garage_member_google_pending";
const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 20 * 60;

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Konfigurasi Google, atau null bila belum diisi Owner (tombol disembunyikan). */
export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  // Client khusus member bila ada; selain itu pakai OAuth client Google yang sudah dipasang untuk integrasi Drive
  // (GOOGLE_OAUTH_CLIENT_ID/SECRET) — Owner cukup menambah redirect URI member di Google Cloud.
  const ownClient = Boolean(env.MEMBER_GOOGLE_CLIENT_ID?.trim() && env.MEMBER_GOOGLE_CLIENT_SECRET?.trim());
  const clientId = (ownClient ? env.MEMBER_GOOGLE_CLIENT_ID : env.GOOGLE_OAUTH_CLIENT_ID)?.trim();
  const clientSecret = (ownClient ? env.MEMBER_GOOGLE_CLIENT_SECRET : env.GOOGLE_OAUTH_CLIENT_SECRET)?.trim();
  const base = (env.MEMBER_PUBLIC_BASE_URL || env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL || env.BETTER_AUTH_URL || "").trim().replace(/\/+$/, "");
  if (!clientId || !clientSecret || !/^https?:\/\//.test(base)) return null;
  return { clientId, clientSecret, redirectUri: `${base}/api/member/auth/google/callback` };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Tujuan kembali yang aman: hanya path internal (bukan //host, bukan skema). */
export function safeNextPath(next: string | null | undefined, fallback = "/member") {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  if (next.startsWith("/api/")) return fallback;
  return next.slice(0, 300);
}

// ── Cookie bertanda tangan (HMAC dengan kunci turunan, beda dari JWT sesi member) ───────────
function cookieKey(purpose: string) {
  return createHmac("sha256", memberAuthSecret()).update(`google-oauth:${purpose}`).digest();
}

export function sealCookieValue(purpose: string, payload: Record<string, unknown>, ttlSeconds: number, now = Date.now()) {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }));
  const sig = createHmac("sha256", cookieKey(purpose)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openCookieValue<T extends Record<string, unknown>>(purpose: string, value: string | null | undefined, now = Date.now()): T | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", cookieKey(purpose)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export type GoogleStatePayload = { state: string; verifier: string; nonce: string; next: string };

/** URL otorisasi + nilai cookie state (dipasang oleh route /start). */
export function buildGoogleAuthorization(config: GoogleConfig, next: string) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const nonce = randomToken(24);
  const url = new URL(googleEndpoints().auth);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  const cookie = sealCookieValue("state", { state, verifier, nonce, next: safeNextPath(next) }, STATE_TTL_SECONDS);
  return { url: url.toString(), cookie, maxAge: STATE_TTL_SECONDS };
}

export function readGoogleState(cookieValue: string | null | undefined, stateParam: string | null) {
  const payload = openCookieValue<GoogleStatePayload>("state", cookieValue);
  if (!payload || !stateParam) return null;
  const a = Buffer.from(payload.state);
  const b = Buffer.from(stateParam);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

// ── ID token ─────────────────────────────────────────────────────────────────
export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string; picture: string | null };

type Jwks = { keys: Array<JsonWebKey & { kid?: string; alg?: string }> };

let jwksCache: { at: number; jwks: Jwks } | null = null;

async function loadJwks(fetchImpl: typeof fetch): Promise<Jwks> {
  if (jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.jwks;
  const response = await fetchImpl(googleEndpoints().jwks, { cache: "no-store" });
  if (!response.ok) throw new GoogleAuthError("JWKS_UNAVAILABLE");
  const jwks = (await response.json()) as Jwks;
  jwksCache = { at: Date.now(), jwks };
  return jwks;
}

export function resetGoogleJwksCache() {
  jwksCache = null;
}

export class GoogleAuthError extends Error {
  constructor(public code: string) {
    super(`Google sign-in gagal (${code}).`);
  }
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: { clientId: string; nonce: string; now?: number; fetchImpl?: typeof fetch },
): Promise<GoogleIdentity> {
  const [headerB64, bodyB64, sigB64] = idToken.split(".");
  if (!headerB64 || !bodyB64 || !sigB64) throw new GoogleAuthError("TOKEN_MALFORMED");
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("TOKEN_MALFORMED");
  }
  if (header.alg !== "RS256" || !header.kid) throw new GoogleAuthError("TOKEN_ALG");
  const jwks = await loadJwks(options.fetchImpl ?? fetch);
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new GoogleAuthError("TOKEN_KEY");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const valid = cryptoVerify("RSA-SHA256", Buffer.from(`${headerB64}.${bodyB64}`), key, Buffer.from(sigB64, "base64url"));
  if (!valid) throw new GoogleAuthError("TOKEN_SIGNATURE");

  const nowSec = Math.floor((options.now ?? Date.now()) / 1000);
  if (!GOOGLE_ISSUERS.has(String(claims.iss))) throw new GoogleAuthError("TOKEN_ISSUER");
  const aud = claims.aud;
  if (!(aud === options.clientId || (Array.isArray(aud) && aud.includes(options.clientId)))) throw new GoogleAuthError("TOKEN_AUDIENCE");
  if (typeof claims.exp !== "number" || claims.exp + 60 < nowSec) throw new GoogleAuthError("TOKEN_EXPIRED");
  if (claims.nonce !== options.nonce) throw new GoogleAuthError("TOKEN_NONCE");
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!sub || !email) throw new GoogleAuthError("TOKEN_CLAIMS");
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  return {
    sub,
    email,
    emailVerified,
    name: typeof claims.name === "string" ? claims.name.slice(0, 80) : email.split("@")[0],
    picture: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture.slice(0, 500) : null,
  };
}

/** Tukar kode otorisasi → ID token terverifikasi. */
export async function exchangeGoogleCode(
  config: GoogleConfig,
  input: { code: string; verifier: string; nonce: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const response = await fetchImpl(googleEndpoints().token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new GoogleAuthError("TOKEN_EXCHANGE");
  const json = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!json?.id_token) throw new GoogleAuthError("TOKEN_EXCHANGE");
  return verifyGoogleIdToken(json.id_token, { clientId: config.clientId, nonce: input.nonce, fetchImpl });
}

// ── Akun baru menunggu lengkapi profil ──────────────────────────────────────
export type GooglePendingProfile = { sub: string; email: string; name: string; picture: string | null; next: string };

export function sealPendingProfile(profile: GooglePendingProfile) {
  return { value: sealCookieValue("pending", profile, PENDING_TTL_SECONDS), maxAge: PENDING_TTL_SECONDS };
}

export function openPendingProfile(value: string | null | undefined) {
  return openCookieValue<GooglePendingProfile & Record<string, unknown>>("pending", value);
}

export function oauthCookie(name: string, value: string, maxAge: number, secure: string, path = "/") {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearOauthCookie(name: string, path = "/") {
  return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Kata sandi acak untuk akun yang dibuat lewat Google (member bisa atur PIN sendiri nanti). */
export function randomUnusablePassword() {
  return randomToken(32);
}
