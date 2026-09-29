import { describe, expect, it } from "vitest";

import { openStatus } from "@/lib/garage-location";

// Jam WIB = UTC+7. Helper: buat Date dari jam WIB.
const wib = (hh: number, mm = 0) => new Date(Date.UTC(2026, 8, 28, hh - 7, mm));

describe("openStatus", () => {
  it("24 jam selalu buka", () => {
    expect(openStatus("00:00", "23:59", wib(3))).toEqual({ isOpen: true, label: "BUKA 24 JAM" });
  });

  it("jam normal 07:00–23:00", () => {
    expect(openStatus("07:00", "23:00", wib(12)).isOpen).toBe(true);
    expect(openStatus("07:00", "23:00", wib(12)).label).toBe("BUKA · TUTUP 23:00");
    expect(openStatus("07:00", "23:00", wib(6, 59)).isOpen).toBe(false);
    expect(openStatus("07:00", "23:00", wib(23)).label).toBe("TUTUP · BUKA 07:00");
  });

  it("jam lewat tengah malam 16:00–02:00", () => {
    expect(openStatus("16:00", "02:00", wib(1)).isOpen).toBe(true);
    expect(openStatus("16:00", "02:00", wib(10)).isOpen).toBe(false);
  });
});
