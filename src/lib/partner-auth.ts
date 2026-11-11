// =============================================================================
// SMART PARTNER HUB — sesi akun mitra (DEC-15: terpisah dari akun staf & member).
// Login nomor HP + PIN → cookie httpOnly berisi JWT HS256 (typ "partner") dengan
// versi sesi; mengganti PIN / menonaktifkan akun menaikkan versi → sesi lama mati.
// partner_id SELALU diambil dari sesi ini, tidak pernah dari parameter klien.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { partnerAccounts, partnerEvents, partners } from "@/db/schema";
import { hashPassword, memberAuthSecret, parseCookies, secureCookieAttribute, verifyPassword } from "@/lib/member-auth";
import { fail } from "@/lib/api-response";
import { effectiveOperationalStatus } from "@/lib/partner-hub-rules";

export const PARTNER_COOKIE = "garage_partner_session";
// 7 hari: mitra tidak perlu login tiap pagi. Akses tetap bisa dicabut seketika (akun nonaktif / PIN diganti → sessionVersion).
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type PartnerJwt = { sub: string; pid: string; sv: number; typ: "partner"; iat: number; exp: number };

function partnerSecret() {
  // Turunan dari secret member/Better Auth, dipisah konteks supaya token member tak bisa dipakai di sini.
  return createHmac("sha256", memberAuthSecret()).update("garage-partner-session-v1").digest("hex");
}

function sign(payload: PartnerJwt) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", partnerSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function signPartnerSession(account: { id: string; partnerId: string; sessionVersion: number }, ttlSeconds = SESSION_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: account.id, pid: account.partnerId, sv: account.sessionVersion, typ: "partner", iat: now, exp: now + ttlSeconds });
}

export function verifyPartnerSession(token: string): PartnerJwt | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", partnerSecret()).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PartnerJwt;
    if (payload.typ !== "partner" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function partnerSessionCookie(token: string, request: Request) {
  return `${PARTNER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secureCookieAttribute(request)}`;
}

export function clearPartnerSessionCookie(request: Request) {
  return `${PARTNER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieAttribute(request)}`;
}

export type PartnerSession = {
  account: { id: string; displayName: string; phone: string };
  partner: { id: string; code: string; name: string; outletId: string; status: string; operationalStatus: string };
};

/** Guard route mitra. Akun & mitra wajib aktif (mitra dibekukan masih bisa menuntaskan tiket lama & melihat laporan). */
export async function requirePartnerSession(request: Request): Promise<{ data: PartnerSession; response: null } | { data: null; response: Response }> {
  const token = parseCookies(request)[PARTNER_COOKIE];
  const payload = token ? verifyPartnerSession(token) : null;
  if (!payload) return { data: null, response: fail(401, "PARTNER_LOGIN_REQUIRED", "Silakan masuk ke Portal Mitra.") };
  const [row] = await getDb()
    .select({ account: partnerAccounts, partner: partners })
    .from(partnerAccounts)
    .innerJoin(partners, eq(partnerAccounts.partnerId, partners.id))
    .where(eq(partnerAccounts.id, payload.sub))
    .limit(1);
  if (
    !row ||
    row.account.status !== "active" ||
    row.account.sessionVersion !== payload.sv ||
    row.account.partnerId !== payload.pid ||
    !["aktif", "dibekukan"].includes(row.partner.status)
  ) {
    return { data: null, response: fail(401, "PARTNER_SESSION_INVALID", "Sesi Portal Mitra tidak berlaku. Masuk lagi.") };
  }
  // Tanda "portal masih terbuka": diperbarui paling sering tiap 30 detik (portal polling tiap 10 detik).
  const now = new Date();
  if (!row.partner.lastSeenAt || now.getTime() - row.partner.lastSeenAt.getTime() > 30_000) {
    await getDb().update(partners).set({ lastSeenAt: now }).where(eq(partners.id, row.partner.id));
  }
  return {
    data: {
      account: { id: row.account.id, displayName: row.account.displayName, phone: row.account.phone },
      partner: {
        id: row.partner.id,
        code: row.partner.code,
        name: row.partner.name,
        outletId: row.partner.outletId,
        status: row.partner.status,
        // Buka/Jeda kemarin tidak terbawa: mitra menekan Buka lagi saat mulai jualan.
        operationalStatus: effectiveOperationalStatus({ operationalStatus: row.partner.operationalStatus, operationalStatusAt: row.partner.operationalStatusAt }, now),
      },
    },
    response: null,
  };
}

/** Cek PIN akun mitra (dipakai route login; batas tebakan ada di route lewat pin-attempt-guard). */
export async function authenticatePartner(phone: string, pin: string) {
  const [row] = await getDb()
    .select({ account: partnerAccounts, partner: partners })
    .from(partnerAccounts)
    .innerJoin(partners, eq(partnerAccounts.partnerId, partners.id))
    .where(eq(partnerAccounts.phone, phone))
    .limit(1);
  if (!row || row.account.status !== "active") return null;
  if (!(await verifyPassword(pin, row.account.pinHash))) return null;
  if (!["aktif", "dibekukan"].includes(row.partner.status)) {
    return { ok: false as const, blocked: "Mitra belum aktif. Hubungi Owner Garage Coffee." };
  }
  await getDb().update(partnerAccounts).set({ lastLoginAt: new Date() }).where(eq(partnerAccounts.id, row.account.id));
  return { ok: true as const, account: row.account, partner: row.partner };
}

/**
 * Mitra mengganti PIN sendiri: PIN lama wajib benar; sesi lama (HP lain) otomatis keluar (sessionVersion naik).
 * Mengembalikan akun terbaru agar pemanggil bisa menerbitkan cookie sesi baru untuk perangkat ini.
 */
export async function changePartnerPin(accountId: string, oldPin: string, newPin: string) {
  if (!/^\d{6}$/.test(newPin)) return { ok: false as const, code: "INVALID_PIN", message: "PIN baru harus 6 angka." };
  if (oldPin === newPin) return { ok: false as const, code: "SAME_PIN", message: "PIN baru harus berbeda dari PIN lama." };
  if (/^(\d)\1{5}$/.test(newPin) || ["123456", "654321", "012345"].includes(newPin)) {
    return { ok: false as const, code: "WEAK_PIN", message: "PIN terlalu mudah ditebak. Pilih kombinasi lain." };
  }
  const db = getDb();
  const [account] = await db.select().from(partnerAccounts).where(eq(partnerAccounts.id, accountId)).limit(1);
  if (!account || account.status !== "active") return { ok: false as const, code: "ACCOUNT_INACTIVE", message: "Akun tidak aktif." };
  if (!(await verifyPassword(oldPin, account.pinHash))) return { ok: false as const, code: "WRONG_PIN", message: "PIN lama salah." };
  const [updated] = await db
    .update(partnerAccounts)
    .set({ pinHash: await hashPassword(newPin), sessionVersion: account.sessionVersion + 1, updatedAt: new Date() })
    .where(eq(partnerAccounts.id, accountId))
    .returning();
  await db.insert(partnerEvents).values({ partnerId: account.partnerId, kind: "account_pin_changed_by_partner", subjectId: account.id, actorType: "partner", actorId: account.id, actorName: account.displayName });
  return { ok: true as const, account: updated };
}
