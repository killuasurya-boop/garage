import { describe, expect, it } from "vitest";

import { guardLockedFor, guardRecordFail, guardReset, type GuardPolicy } from "@/lib/pin-guard";

const policy: GuardPolicy = { maxFails: 3, windowMs: 60_000, lockMs: 120_000 };

describe("pin-guard", () => {
  it("mengunci setelah maxFails dalam jendela, lalu terbuka setelah lockMs", () => {
    const key = "t1";
    guardRecordFail(key, policy, 0);
    guardRecordFail(key, policy, 10_000);
    expect(guardLockedFor(key, 10_000)).toBeNull();
    guardRecordFail(key, policy, 20_000);
    expect(guardLockedFor(key, 20_000)).toBe(120);
    expect(guardLockedFor(key, 139_000)).toBe(1);
    expect(guardLockedFor(key, 140_000)).toBeNull();
  });

  it("tebak pelan: kegagalan lama keluar dari jendela, tapi pola cepat tetap terkunci", () => {
    const key = "t2";
    guardRecordFail(key, policy, 0);
    guardRecordFail(key, policy, 70_000); // yang pertama sudah kedaluwarsa
    guardRecordFail(key, policy, 80_000);
    expect(guardLockedFor(key, 80_000)).toBeNull();
    guardRecordFail(key, policy, 90_000);
    expect(guardLockedFor(key, 90_000)).not.toBeNull();
  });

  it("reset menghapus hitungan", () => {
    const key = "t3";
    guardRecordFail(key, policy, 0);
    guardRecordFail(key, policy, 1);
    guardReset(key);
    guardRecordFail(key, policy, 2);
    expect(guardLockedFor(key, 2)).toBeNull();
  });
});
