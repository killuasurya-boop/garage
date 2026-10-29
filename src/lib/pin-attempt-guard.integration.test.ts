import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit #13: tebakan PIN dibatasi di DATABASE — tidak ter-reset saat proses restart.
let t: GarageTestDb;
let guard: typeof import("@/lib/pin-attempt-guard");

beforeAll(async () => {
  t = await setupGarageTestDb();
  guard = await import("@/lib/pin-attempt-guard");
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("pembatas tebakan PIN persisten", () => {
  it("8 PIN salah → terkunci sampai jendela berakhir; kunci lain tidak terpengaruh", async () => {
    const now = new Date("2026-10-29T10:01:00.000Z");
    expect(await guard.checkPinAttempt("absen:code:K01", now)).toEqual({ allowed: true });
    for (let i = 0; i < guard.PIN_MAX_FAILS; i++) await guard.recordPinFailure("absen:code:K01", now);
    const locked = await guard.checkPinAttempt("absen:code:K01", now);
    expect(locked.allowed).toBe(false);
    expect(locked.retryAfterSec).toBe(240); // jendela 10:00–10:05
    expect(await guard.checkPinAttempt("absen:code:K02", now)).toEqual({ allowed: true });
    expect(await guard.lockedPinKeys(now)).toEqual(["absen:code:K01"]);
  });

  it("kunci tersimpan di DB: modul dimuat ulang (≈ restart) tetap terkunci", async () => {
    const now = new Date("2026-10-29T10:02:00.000Z");
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("@/lib/pin-attempt-guard");
    expect((await fresh.checkPinAttempt("absen:code:K01", now)).allowed).toBe(false);
  });

  it("jendela baru → boleh lagi; PIN benar mereset hitungan", async () => {
    expect((await guard.checkPinAttempt("absen:code:K01", new Date("2026-10-29T10:05:01.000Z"))).allowed).toBe(true);
    const now = new Date("2026-10-29T10:06:00.000Z");
    for (let i = 0; i < 3; i++) await guard.recordPinFailure("absen:ip:1.2.3.4", now);
    await guard.resetPinAttempts("absen:ip:1.2.3.4");
    for (let i = 0; i < guard.PIN_MAX_FAILS - 1; i++) await guard.recordPinFailure("absen:ip:1.2.3.4", now);
    expect((await guard.checkPinAttempt("absen:ip:1.2.3.4", now)).allowed).toBe(true);
  });
});
