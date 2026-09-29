import { describe, expect, it } from "vitest";

import { memberPasswordWeakness } from "@/lib/garage-service";

// QA-audit: form kasir dulu mengisi otomatis "member12345" → semua member
// bisa diambil alih cukup dengan nomor HP.
describe("memberPasswordWeakness", () => {
  it("menolak default lama, angka kembar/berurutan, dan nomor HP", () => {
    expect(memberPasswordWeakness("member12345", "081234567890")).toMatch(/default/i);
    expect(memberPasswordWeakness("111111", "081234567890")).toMatch(/mudah/i);
    expect(memberPasswordWeakness("123456", "081234567890")).toMatch(/mudah/i);
    expect(memberPasswordWeakness("371645", "081298371645")).toMatch(/nomor HP/i);
    expect(memberPasswordWeakness("12345", "081234567890")).toMatch(/minimal/i);
  });

  it("menerima PIN wajar", () => {
    expect(memberPasswordWeakness("739214", "081234567890")).toBeNull();
    expect(memberPasswordWeakness("kopi-garage-7", "081234567890")).toBeNull();
  });
});
