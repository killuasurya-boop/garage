import { describe, expect, it } from "vitest";

import { requiredMethodFor } from "@/lib/garage-attendance-v2";

// Satu akun = login = absen: absen lewat sesi login tidak boleh lebih longgar
// dari /absen (default PIN + selfie + GPS).
describe("requiredMethodFor", () => {
  it("default semua role PIN + selfie + GPS", () => {
    for (const role of ["Kasir", "Waiter", "Manajer"]) {
      expect(requiredMethodFor(role, null)).toBe("pin_selfie_gps");
    }
  });

  it("setting lama Kasir: \"pin\" tidak melonggarkan absen sesi login", () => {
    const legacy = { default: "pin_selfie_gps", Kasir: "pin", Waiter: "pin_selfie_gps_multi" };
    expect(requiredMethodFor("Kasir", legacy)).toBe("pin_selfie_gps");
    expect(requiredMethodFor("Waiter", legacy)).toBe("pin_selfie_gps");
  });

  it("owner yang sengaja melonggarkan /absen tetap diikuti", () => {
    expect(requiredMethodFor("Kasir", { absen: "pin", Kasir: "pin" })).toBe("pin");
    expect(requiredMethodFor("Kasir", { absen: "pin", default: "pin_selfie_gps" })).toBe("pin_selfie_gps");
  });
});
