import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Login member Google (Crystal V5, Owner Nov 2026): tautkan akun lama lewat email terverifikasi, tanpa duplikat;
// akun baru wajib lengkapi profil + S&K; persetujuan pemasaran terpisah & default tidak setuju. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let ms: typeof import("@/lib/member-service");

const identity = (over: Partial<{ sub: string; email: string; emailVerified: boolean }> = {}) => ({
  sub: "g-sub-1",
  email: "raka@example.com",
  emailVerified: true,
  name: "Raka Pratama",
  picture: "https://lh3.googleusercontent.com/a/x",
  ...over,
});

async function account(where: { email?: string; googleSub?: string }) {
  const { eq } = await import("drizzle-orm");
  const s = t.schema.memberAccounts;
  const rows = await t
    .getDb()
    .select()
    .from(s)
    .where(where.email ? eq(s.email, where.email) : eq(s.googleSub, where.googleSub!));
  return rows;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: "user-google-itest" });
  ms = await import("@/lib/member-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Google sign-in member", () => {
  it("email belum terverifikasi Google ditolak", async () => {
    const result = await ms.signInMemberWithGoogle(identity({ emailVerified: false }));
    expect(result.kind).toBe("error");
  });

  it("akun baru → perlu lengkapi profil; tanpa S&K ditolak", async () => {
    expect((await ms.signInMemberWithGoogle(identity())).kind).toBe("needs_profile");
    const refused = await ms.completeGoogleMember({
      identity: identity(),
      name: "Raka",
      phone: "081234500001",
      acceptTerms: false,
      marketingConsent: false,
      randomPassword: "rand-1",
    });
    expect(refused.data).toBeNull();
  });

  it("aktivasi: google_sub + email terverifikasi + S&K tercatat; pemasaran default off", async () => {
    const done = await ms.completeGoogleMember({
      identity: identity(),
      name: "Raka Pratama",
      phone: "081234500001",
      acceptTerms: true,
      marketingConsent: false,
      randomPassword: "rand-1",
    });
    expect(done.error).toBeNull();
    const [row] = await account({ googleSub: "g-sub-1" });
    expect(row.email).toBe("raka@example.com");
    expect(row.emailVerifiedAt).toBeTruthy();
    expect(row.termsAcceptedAt).toBeTruthy();
    expect(row.marketingConsentAt).toBeNull();
    // Login berikutnya langsung masuk (tidak membuat akun kedua).
    const again = await ms.signInMemberWithGoogle(identity());
    expect(again.kind).toBe("login");
    const repeat = await ms.completeGoogleMember({ identity: identity(), name: "X", phone: "081234500009", acceptTerms: true, marketingConsent: true, randomPassword: "r" });
    expect(repeat.error).toBeNull();
    expect(await account({ email: "raka@example.com" })).toHaveLength(1);
  });

  it("member lama (HP/PIN) dengan email sama ditautkan, bukan diduplikasi", async () => {
    const reg = await ms.registerMember({ name: "Sari", phone: "081234500002", email: "sari@example.com", password: "123456" });
    expect(reg.data).toBeTruthy();
    const result: any = await ms.signInMemberWithGoogle(identity({ sub: "g-sub-2", email: "Sari@Example.com" }));
    expect(result.kind).toBe("login");
    expect(result.linked).toBe(true);
    const rows = await account({ email: "sari@example.com" });
    expect(rows).toHaveLength(1);
    expect(rows[0].googleSub).toBe("g-sub-2");
    // Akun Google lain dengan email yang sama tidak bisa mengambil alih.
    const hijack = await ms.signInMemberWithGoogle(identity({ sub: "g-sub-evil", email: "sari@example.com" }));
    expect(hijack.kind).toBe("error");
  });
});
