import { describe, expect, it } from "vitest";

import { staffPasswordWeakness } from "@/lib/password-policy";

describe("staffPasswordWeakness", () => {
  it("menolak default seed, pendek, berurutan, tanpa angka, memuat nama akun", () => {
    expect(staffPasswordWeakness("garage12345")).toMatch(/bawaan/i);
    expect(staffPasswordWeakness("abc12")).toMatch(/minimal/i);
    expect(staffPasswordWeakness("12345678")).toMatch(/bawaan|mudah/i);
    expect(staffPasswordWeakness("aaaaaaaa")).toMatch(/mudah/i);
    expect(staffPasswordWeakness("kopisusugula")).toMatch(/huruf dan angka/i);
    expect(staffPasswordWeakness("kasir2026x", { email: "kasir@garage.id" })).toMatch(/nama akun/i);
  });

  it("menerima password wajar", () => {
    expect(staffPasswordWeakness("Tebing-Kopi-73", { email: "owner@garage.id" })).toBeNull();
  });
});
