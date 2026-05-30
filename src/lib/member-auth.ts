import { scrypt as scryptCallback, timingSafeEqual, createHmac, randomBytes, randomUUID, createHash } from "node:crypto";
import { promisify } from "node:util";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { customers, memberAccounts, memberSessions } from "@/db/schema";
import { errorJson, memberResponseData } from "@/lib/member-types";

const scrypt = promisify(scryptCallback);

const ACCESS_COOKIE = "garage_member_access";
const REFRESH_COOKIE = "garage_member_refresh";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

type JwtPayload = {
  sub: string;
  typ: "access" | "refresh";
  sid?: string;
  iat: number;
  exp: number;
};

function authSecret() {
  const secret = process.env.MEMBER_AUTH_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MEMBER_AUTH_SECRET atau BETTER_AUTH_SECRET wajib diisi untuk production.");
  }
  return "garage-dev-only-member-auth-secret";
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signJwtPayload(payload: JwtPayload) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", authSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function signMemberJwt(
  accountId: string,
  type: "access" | "refresh",
  ttlSeconds = type === "access" ? ACCESS_TTL_SECONDS : REFRESH_TTL_SECONDS,
  sessionId?: string,
) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtPayload({
    sub: accountId,
    typ: type,
    sid: sessionId,
    iat: now,
    exp: now + ttlSeconds,
  });
}

export function verifyMemberJwt(token: string, expectedType: "access" | "refresh") {
  const [encodedHeader, encodedBody, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedBody || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", authSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");

  const actual = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8")) as JwtPayload;
    if (payload.typ !== expectedType || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, encodedKey] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !encodedKey) {
    return false;
  }

  const stored = Buffer.from(encodedKey, "base64url");
  const key = (await scrypt(password, salt, stored.length)) as Buffer;
  return key.length === stored.length && timingSafeEqual(key, stored);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return auth.slice(7).trim();
}

export function readAccessToken(request: Request) {
  return bearerToken(request) ?? parseCookies(request)[ACCESS_COOKIE] ?? null;
}

export function readRefreshToken(request: Request) {
  return parseCookies(request)[REFRESH_COOKIE] ?? null;
}

function secureCookieAttribute(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProtocol = forwardedProto || new URL(request.url).protocol.replace(":", "");
  return requestProtocol === "https" ? "; Secure" : "";
}

export function memberCookieHeaders(
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
  request: Request,
) {
  const secure = secureCookieAttribute(request);
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_TTL_SECONDS}${secure}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Expires=${refreshExpiresAt.toUTCString()}${secure}`,
  ];
}

export function clearMemberCookieHeaders() {
  return [
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ];
}

export async function createMemberTokenPair(accountId: string, request: Request) {
  const sessionId = randomUUID();
  const accessToken = signMemberJwt(accountId, "access");
  const refreshToken = signMemberJwt(accountId, "refresh", REFRESH_TTL_SECONDS, sessionId);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  await getDb().insert(memberSessions).values({
    id: sessionId,
    accountId,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt: refreshExpiresAt,
  });

  return { accessToken, refreshToken, refreshExpiresAt };
}

export async function rotateMemberTokenPair(refreshToken: string, request: Request) {
  const payload = verifyMemberJwt(refreshToken, "refresh");
  if (!payload?.sid) {
    return null;
  }

  const [session] = await getDb()
    .select()
    .from(memberSessions)
    .where(
      and(
        eq(memberSessions.id, payload.sid),
        eq(memberSessions.refreshTokenHash, hashToken(refreshToken)),
        isNull(memberSessions.revokedAt),
      ),
    )
    .limit(1);

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  const accessToken = signMemberJwt(session.accountId, "access");
  const newRefreshToken = signMemberJwt(session.accountId, "refresh", REFRESH_TTL_SECONDS, session.id);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  await getDb()
    .update(memberSessions)
    .set({
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      updatedAt: new Date(),
    })
    .where(eq(memberSessions.id, session.id));

  return { accessToken, refreshToken: newRefreshToken, refreshExpiresAt };
}

export async function revokeRefreshToken(refreshToken: string | null) {
  if (!refreshToken) return;
  const payload = verifyMemberJwt(refreshToken, "refresh");
  if (!payload?.sid) return;

  await getDb()
    .update(memberSessions)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(memberSessions.id, payload.sid));
}

export async function requireMemberAuth(request: Request) {
  const token = readAccessToken(request);
  if (!token) {
    return { data: null, response: errorJson(401, "Member login diperlukan.") };
  }

  const payload = verifyMemberJwt(token, "access");
  if (!payload) {
    return { data: null, response: errorJson(401, "Sesi member tidak valid atau sudah kedaluwarsa.") };
  }

  const [row] = await getDb()
    .select({ account: memberAccounts, customer: customers })
    .from(memberAccounts)
    .innerJoin(customers, eq(memberAccounts.customerId, customers.id))
    .where(eq(memberAccounts.id, payload.sub))
    .limit(1);

  if (!row || row.account.status !== "active") {
    return { data: null, response: errorJson(401, "Akun member tidak aktif.") };
  }

  return {
    data: {
      account: row.account,
      customer: row.customer,
      member: memberResponseData(row.customer),
    },
    response: null,
  };
}
