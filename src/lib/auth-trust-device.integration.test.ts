import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Owner 28 Okt 2026: login tidak boleh merepotkan.
// - "Ingat perangkat ini 30 hari" pada 2FA: perangkat itu langsung masuk tanpa kode 2FA,
//   perangkat lain tetap diminta 2FA.
// - Sesi default 30 hari dan diperpanjang saat dipakai (updateAge).
// Auth asli (Better Auth) di atas PGlite.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = "http://localhost:3001";
const PASSWORD = "Garage-Trust-Owner-2026!";
const EMAIL = "owner-trust@garage.id";

let t: GarageTestDb;
let auth: typeof import("@/lib/auth").auth;

/** Cookie jar sederhana: gabungkan cookie lama + Set-Cookie baru (nama sama ditimpa). */
function jar(previous: string, response: Response) {
  const map = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((pair) => [pair.split("=")[0], pair] as const),
  );
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const name = pair.split("=")[0];
    if (/max-age=0/i.test(raw) || pair.endsWith("=")) map.delete(name);
    else map.set(name, pair);
  }
  return [...map.values()].join("; ");
}

async function call(path: string, init: RequestInit = {}) {
  return auth.handler(new Request(`${BASE}${path}`, init));
}

async function signIn(cookie = "") {
  return call("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
}

let otp: ReturnType<typeof createOTP>;

beforeAll(async () => {
  t = await setupGarageTestDb();
  const { outletId } = await seedGarageBasics(t, { userId: "user-trust-seed" });
  process.env.BETTER_AUTH_URL = BASE;
  ({ auth } = await import("@/lib/auth"));
  const signUp = await call("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Owner Trust" }),
  });
  expect(signUp.status).toBe(200);
  const userId = ((await signUp.json()) as any).user.id as string;
  await t.getDb().insert(t.schema.staffProfiles).values({ userId, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any);

  // Pasang 2FA sungguhan seperti di /control/2fa.
  const first = await signIn();
  const cookie = jar("", first);
  const enable = await call("/api/auth/two-factor/enable", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: PASSWORD }),
  });
  expect(enable.status).toBe(200);
  const secret = new URL(((await enable.json()) as any).totpURI).searchParams.get("secret") ?? "";
  otp = createOTP(base32.decode(secret));
  const confirm = await call("/api/auth/two-factor/verify-totp", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ code: await otp.totp() }),
  });
  expect(confirm.status).toBe(200);
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("login tanpa repot (Owner 28 Okt 2026)", () => {
  it("'Ingat perangkat ini' → login berikutnya di perangkat itu tanpa 2FA; perangkat lain tetap 2FA", async () => {
    // Perangkat A: login → diminta 2FA → verifikasi dengan trustDevice.
    const login = await signIn();
    expect(((await login.json()) as any).twoFactorRedirect).toBe(true);
    let deviceA = jar("", login);
    const verify = await call("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: deviceA },
      body: JSON.stringify({ code: await otp.totp(), trustDevice: true }),
    });
    expect(verify.status).toBe(200);
    deviceA = jar(deviceA, verify);
    expect(deviceA).toMatch(/trust_device/);

    // Logout lalu login lagi di perangkat A: langsung sesi, tanpa twoFactorRedirect.
    const signOut = await call("/api/auth/sign-out", { method: "POST", headers: { cookie: deviceA } });
    deviceA = jar(deviceA, signOut);
    const again = await signIn(deviceA);
    const againJson = (await again.json()) as any;
    expect(againJson.twoFactorRedirect).toBeUndefined();
    expect(againJson.user?.email).toBe(EMAIL);

    // Perangkat B (tanpa cookie terpercaya): tetap diminta 2FA.
    const deviceB = await signIn();
    expect(((await deviceB.json()) as any).twoFactorRedirect).toBe(true);
  });

  it("sesi 30 hari secara default", async () => {
    const login = await signIn();
    const cookie = jar("", login);
    const verify = await call("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ code: await otp.totp() }),
    });
    const session = await call("/api/auth/get-session", { headers: { cookie: jar(cookie, verify) } });
    const expiresAt = new Date(((await session.json()) as any).session.expiresAt).getTime();
    const days = (expiresAt - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe("akun tidak pernah dikunci 15 menit (Owner 28 Okt 2026)", () => {
  it("12 kali salah kode 2FA berturut-turut (lewat batas kunci bawaan 10) → akun tidak dikunci", async () => {
    const good = await otp.totp();
    const wrong = String((Number(good) + 7) % 1_000_000).padStart(6, "0");
    // Per sesi verifikasi maks 5 percobaan → diminta isi password lagi (tanpa menunggu).
    for (let round = 0; round < 3; round++) {
      const login = await signIn();
      expect(((await login.json()) as any).twoFactorRedirect).toBe(true);
      const cookie = jar("", login);
      for (let i = 0; i < 4; i++) {
        const bad = await call("/api/auth/two-factor/verify-totp", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ code: wrong }),
        });
        expect(bad.status).not.toBe(200);
        expect(JSON.stringify(await bad.json())).not.toMatch(/locked/i);
      }
    }
    const login = await signIn();
    expect(login.status).toBe(200);
    const ok = await call("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jar("", login) },
      body: JSON.stringify({ code: await otp.totp() }),
    });
    expect(ok.status).toBe(200);
  });

  it("banyak salah password tidak mengunci akun (default lockout = 0)", async () => {
    const { getLockoutState, recordLoginAttempt } = (await import("@/lib/garage-login-attempts-service")) as any;
    for (let i = 0; i < 8; i++) {
      if (recordLoginAttempt) await recordLoginAttempt({ email: EMAIL, success: false, failureReason: "uji" });
      else await t.getDb().insert(t.schema.loginAttempts).values({ email: EMAIL, success: false, failureReason: "uji" } as any);
    }
    expect((await getLockoutState(EMAIL)).locked).toBe(false);
    const login = await signIn();
    expect(login.status).toBe(200);
  });
});
