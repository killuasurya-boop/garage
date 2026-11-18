// =============================================================================
// WiFi gratis khusus member — MikroTik Hotspot.
// Router menarik (pull) skrip harian dari Garage OS (VPS tidak perlu bisa
// menjangkau router di balik NAT). Satu user hotspot bersama ("garage-member")
// dengan password harian = HMAC(GARAGE_WIFI_SECRET, tanggal WIB): tidak
// disimpan di DB dan berganti setiap hari. Halaman /wifi memberikannya hanya
// kepada member yang login, lalu login otomatis ke router.
// =============================================================================

import { createHmac } from "node:crypto";

import { and, count, desc, eq, gte, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings, customers, outlets, wifiAccessLogs } from "@/db/schema";
import { getAppSettings } from "@/lib/garage-service";

export const WIFI_HOTSPOT_USER = "garage-member";
export const WIFI_HOTSPOT_PROFILE = "garage-member";
// Masuk cepat tamu (Owner 18 Nov 2026): user & profile terpisah → batas sesi sendiri, password harian sendiri.
export const WIFI_GUEST_USER = "garage-guest";
export const WIFI_GUEST_PROFILE = "garage-guest";

export function wifiSecret(): string | null {
  const value = process.env.GARAGE_WIFI_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

/** Tanggal WIB "YYYY-MM-DD". */
export function wifiDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

/** Password harian 10 karakter (huruf kecil + angka, mudah diketik bila perlu). */
export function dailyWifiPassword(secret: string, dateKey: string): string {
  const digest = createHmac("sha256", secret).update(`garage-wifi:${dateKey}`).digest();
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += alphabet[digest[i] % alphabet.length];
  return out;
}

/** Password harian tamu: label HMAC berbeda → tidak pernah sama dengan password member. */
export function dailyGuestWifiPassword(secret: string, dateKey: string): string {
  return dailyWifiPassword(secret, `guest:${dateKey}`);
}

/** Nomor WhatsApp Indonesia untuk masuk cepat (08xx / 628xx / +628xx). */
export function normalizeGuestPhone(raw: string): string | null {
  const phone = raw.replace(/[^\d+]/g, "").replace(/^(\+62|62)/, "0");
  return /^08\d{8,11}$/.test(phone) ? phone : null;
}

/**
 * Isi QR "gabung WiFi" standar (dibaca kamera iPhone/Android): jaringan tamu terbuka, jadi tanpa password.
 * Keamanan tetap di login hotspot (password harian per hari, tidak pernah ada di QR). Karakter khusus di-escape.
 */
export function wifiJoinQrPayload(ssid: string): string {
  const escaped = ssid.trim().replace(/([\\;,:"])/g, "\\$1");
  return `WIFI:T:nopass;S:${escaped};;`;
}

/** Status sinkron router: router sudah mengambil skrip berisi password hari ini (WIB) — bukti pengambilan, bukan pemasangan. */
export function routerSyncState(lastSyncIso: string | null, now = new Date()) {
  if (!lastSyncIso || Number.isNaN(Date.parse(lastSyncIso))) return { lastSync: null, syncedToday: false, late: true };
  const syncedToday = wifiDateKey(new Date(lastSyncIso)) === wifiDateKey(now);
  // Scheduler router jalan 00:01 WIB; lewat 00:30 belum sinkron = peringatan.
  const minutesIntoDay = (now.getTime() - Date.parse(`${wifiDateKey(now)}T00:00:00+07:00`)) / 60_000;
  return { lastSync: lastSyncIso, syncedToday, late: !syncedToday && minutesIntoDay >= 30 };
}

/** Nilai RouterOS dalam tanda kutip — hanya karakter aman yang lolos. */
function rosQuote(value: string): string {
  return `"${value.replace(/[^A-Za-z0-9 ._:@-]/g, "")}"`;
}

/**
 * Skrip RouterOS v6/v7 (`/tool fetch` + `/import`): pastikan profile & user
 * hotspot member ada, lalu set password hari ini + batas sesi.
 */
export function buildRouterScript(input: {
  password: string;
  sessionHours: number;
  sharedUsers: number;
  dateKey: string;
  guest?: { password: string; sessionHours: number } | null;
}): string {
  const clampHours = (h: number) => Math.min(24, Math.max(1, Math.round(h)));
  const shared = Math.min(500, Math.max(1, Math.round(input.sharedUsers)));
  const userLines = (userName: string, profileName: string, password: string, sessionHours: number) => {
    const user = rosQuote(userName);
    const profile = rosQuote(profileName);
    return [
      `:if ([:len [/ip hotspot user profile find name=${profile}]] = 0) do={ /ip hotspot user profile add name=${profile} }`,
      `/ip hotspot user profile set [find name=${profile}] shared-users=${shared} session-timeout=${clampHours(sessionHours)}h`,
      `:if ([:len [/ip hotspot user find name=${user}]] = 0) do={ /ip hotspot user add name=${user} profile=${profile} }`,
      `/ip hotspot user set [find name=${user}] password=${rosQuote(password)} profile=${profile} limit-uptime=0s disabled=no`,
    ];
  };
  const guestUser = rosQuote(WIFI_GUEST_USER);
  return [
    `# Garage OS - WiFi member ${input.dateKey} (dibuat otomatis, jangan diedit)`,
    ...userLines(WIFI_HOTSPOT_USER, WIFI_HOTSPOT_PROFILE, input.password, input.sessionHours),
    ...(input.guest
      ? userLines(WIFI_GUEST_USER, WIFI_GUEST_PROFILE, input.guest.password, input.guest.sessionHours)
      : // Masuk cepat dimatikan Owner → user tamu dinonaktifkan.
        [`:if ([:len [/ip hotspot user find name=${guestUser}]] > 0) do={ /ip hotspot user set [find name=${guestUser}] disabled=yes }`]),
    `:log info "Garage OS: password WiFi diperbarui ${input.dateKey}"`,
    "",
  ].join("\n");
}

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * Alamat login hotspot dari MikroTik ($(link-login-only)) hanya boleh ke
 * router lokal (IP privat atau nama DNS hotspot yang diatur owner), supaya
 * password harian tidak bisa dipancing ke server lain.
 */
export function safeHotspotLoginUrl(raw: string | null | undefined, allowedHost?: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const allowed = allowedHost?.trim().toLowerCase();
  if (PRIVATE_V4.some((re) => re.test(host)) || (allowed && host === allowed)) {
    return `${url.origin}${url.pathname}`;
  }
  return null;
}

// ---------- Service (DB) ----------

export async function getWifiSettings() {
  const [outlet] = await getDb()
    .select({ id: outlets.id })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(outlets.code)
    .limit(1);
  const settings = await getAppSettings(outlet?.id ?? null);
  return {
    enabled: settings.wifiEnabled,
    ssid: settings.wifiSsid,
    sessionHours: settings.wifiSessionHours,
    maxDevices: settings.wifiMaxDevices,
    hotspotHost: settings.wifiHotspotHost,
    guestEnabled: settings.wifiGuestEnabled,
    guestSessionHours: settings.wifiGuestSessionHours,
    configured: Boolean(wifiSecret()),
  };
}

export class WifiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "WifiError";
  }
}

/** Member login di /wifi → catat akses & kembalikan kredensial hotspot hari ini. */
export async function grantMemberWifi(
  customerId: string,
  input: { mac?: string | null; ip?: string | null; loginUrl?: string | null },
  now = new Date(),
) {
  const settings = await getWifiSettings();
  if (!settings.enabled) throw new WifiError(403, "WIFI_DISABLED", "WiFi member sedang tidak aktif.");
  const secret = wifiSecret();
  if (!secret) throw new WifiError(503, "WIFI_NOT_CONFIGURED", "WiFi member belum dikonfigurasi di server.");
  const loginUrl = safeHotspotLoginUrl(input.loginUrl, settings.hotspotHost);
  if (!loginUrl) {
    throw new WifiError(400, "WIFI_NOT_ON_HOTSPOT", "Buka halaman ini dari jaringan WiFi Garage (halaman login hotspot).");
  }
  const mac = input.mac && /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i.test(input.mac) ? input.mac.toUpperCase() : null;
  const ip = input.ip && /^[0-9.]{7,15}$/.test(input.ip) ? input.ip : null;
  await getDb().insert(wifiAccessLogs).values({ customerId, mac, ip });
  return {
    loginUrl,
    username: WIFI_HOTSPOT_USER,
    password: dailyWifiPassword(secret, wifiDateKey(now)),
    sessionHours: settings.sessionHours,
    ssid: settings.ssid,
  };
}

/**
 * Masuk cepat tamu (tanpa daftar member): nama + nomor WA → kredensial hotspot tamu hari ini + catat log.
 * Tamu BUKAN baris `customers` (aturan merge member/OTP tidak tersentuh); datanya untuk CRM/promo dari log.
 */
export async function grantGuestWifi(
  input: { name: string; phone: string; mac?: string | null; ip?: string | null; loginUrl?: string | null },
  now = new Date(),
) {
  const settings = await getWifiSettings();
  if (!settings.enabled) throw new WifiError(403, "WIFI_DISABLED", "WiFi sedang tidak aktif.");
  if (!settings.guestEnabled) throw new WifiError(403, "WIFI_GUEST_DISABLED", "WiFi khusus member. Silakan masuk / daftar member.");
  const secret = wifiSecret();
  if (!secret) throw new WifiError(503, "WIFI_NOT_CONFIGURED", "WiFi belum dikonfigurasi di server.");
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (name.length < 2) throw new WifiError(400, "WIFI_GUEST_NAME", "Isi nama kamu (minimal 2 huruf).");
  const phone = normalizeGuestPhone(input.phone);
  if (!phone) throw new WifiError(400, "WIFI_GUEST_PHONE", "Nomor WhatsApp tidak valid (contoh 0812xxxxxxx).");
  const loginUrl = safeHotspotLoginUrl(input.loginUrl, settings.hotspotHost);
  if (!loginUrl) {
    throw new WifiError(400, "WIFI_NOT_ON_HOTSPOT", "Buka halaman ini dari jaringan WiFi Garage (halaman login hotspot).");
  }
  const mac = input.mac && /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i.test(input.mac) ? input.mac.toUpperCase() : null;
  const ip = input.ip && /^[0-9.]{7,15}$/.test(input.ip) ? input.ip : null;
  await getDb().insert(wifiAccessLogs).values({ kind: "guest", guestName: name, guestPhone: phone, mac, ip });
  return {
    loginUrl,
    username: WIFI_GUEST_USER,
    password: dailyGuestWifiPassword(secret, wifiDateKey(now)),
    sessionHours: settings.guestSessionHours,
    ssid: settings.ssid,
  };
}

/** Ringkasan pemakaian WiFi (untuk Owner/Manajer). */
export async function getWifiUsage(now = new Date()) {
  const db = getDb();
  const startOfDay = new Date(`${wifiDateKey(now)}T00:00:00+07:00`);
  const [todayRows, recent] = await Promise.all([
    db
      .select({ kind: wifiAccessLogs.kind, total: count(wifiAccessLogs.id) })
      .from(wifiAccessLogs)
      .where(gte(wifiAccessLogs.createdAt, startOfDay))
      .groupBy(wifiAccessLogs.kind),
    db
      .select({
        id: wifiAccessLogs.id,
        kind: wifiAccessLogs.kind,
        memberName: customers.name,
        memberPhone: customers.phone,
        guestName: wifiAccessLogs.guestName,
        guestPhone: wifiAccessLogs.guestPhone,
        mac: wifiAccessLogs.mac,
        createdAt: wifiAccessLogs.createdAt,
      })
      .from(wifiAccessLogs)
      .leftJoin(customers, eq(customers.id, wifiAccessLogs.customerId))
      .where(and(gte(wifiAccessLogs.createdAt, new Date(startOfDay.getTime() - 6 * 86_400_000))))
      .orderBy(desc(wifiAccessLogs.createdAt))
      .limit(30),
  ]);
  const byKind = new Map(todayRows.map((r) => [r.kind, Number(r.total)]));
  const todayMembers = byKind.get("member") ?? 0;
  const todayGuests = byKind.get("guest") ?? 0;
  return {
    todayLogins: todayMembers + todayGuests,
    todayMembers,
    todayGuests,
    recent: recent.map((row) => {
      const guest = row.kind === "guest";
      return {
        id: row.id,
        kind: guest ? ("guest" as const) : ("member" as const),
        name: guest ? row.guestName : row.memberName,
        phone: guest ? row.guestPhone : row.memberPhone,
        mac: row.mac,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}

// ---------- Sinkron router (tanpa migrasi: baris app_settings global) ----------

const ROUTER_SYNC_KEY = "wifi_router_last_sync";

/** Dicatat saat router menarik skrip berisi password harian (WiFi aktif). Waktu saja, tanpa password/key. */
export async function recordRouterSync(now = new Date()) {
  const db = getDb();
  const value = { at: now.toISOString() };
  const updated = await db
    .update(appSettings)
    .set({ valueJson: value, updatedAt: now, updatedBy: "router" })
    .where(and(eq(appSettings.key, ROUTER_SYNC_KEY), isNull(appSettings.outletId)))
    .returning({ id: appSettings.id });
  if (!updated.length) await db.insert(appSettings).values({ key: ROUTER_SYNC_KEY, outletId: null, valueJson: value, updatedBy: "router" });
}

export async function getRouterSync(now = new Date()) {
  const [row] = await getDb()
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.key, ROUTER_SYNC_KEY), isNull(appSettings.outletId)))
    .limit(1);
  const at = (row?.valueJson as { at?: unknown } | undefined)?.at;
  return routerSyncState(typeof at === "string" ? at : null, now);
}
