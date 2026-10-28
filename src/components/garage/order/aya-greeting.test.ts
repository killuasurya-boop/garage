import { describe, expect, it } from "vitest";

import { ayaGreetingSalam } from "@/components/garage/order/aya-greeting";

// Jam dalam UTC; WIB = UTC+7.
describe("ayaGreetingSalam", () => {
  it("memakai jam WIB, bukan jam perangkat", () => {
    expect(ayaGreetingSalam(new Date("2026-10-27T00:30:00Z"))).toBe("Selamat pagi"); // 07:30 WIB
    expect(ayaGreetingSalam(new Date("2026-10-27T05:00:00Z"))).toBe("Selamat siang"); // 12:00
    expect(ayaGreetingSalam(new Date("2026-10-27T09:00:00Z"))).toBe("Selamat sore"); // 16:00
    expect(ayaGreetingSalam(new Date("2026-10-27T13:00:00Z"))).toBe("Selamat malam"); // 20:00
    expect(ayaGreetingSalam(new Date("2026-10-27T20:30:00Z"))).toBe("Selamat malam"); // 03:30
  });
});
