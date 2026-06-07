import { describe, it, expect } from "vitest";

import {
  attendanceStatusLabel,
  evaluatePunchStatus,
  formatWorkedHours,
  hashPin,
  haversineMeters,
  pinHashEquals,
} from "@/lib/attendance";

// Logika absensi = integritas operasional (anti titip-absen, geofence, telat).
// Test deterministik; assertion timezone-sensitif sengaja dihindari.

describe("hashPin", () => {
  it("deterministik: input sama -> hash sama", () => {
    expect(hashPin("1234")).toBe(hashPin("1234"));
  });
  it("PIN beda -> hash beda", () => {
    expect(hashPin("1234")).not.toBe(hashPin("5678"));
  });
  it("trim spasi (PIN '1234 ' == '1234')", () => {
    expect(hashPin("1234 ")).toBe(hashPin("1234"));
  });
  it("output hex sha256 (64 char)", () => {
    expect(hashPin("1234")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("pinHashEquals (timing-safe)", () => {
  it("hash sama -> true", () => {
    const h = hashPin("4321");
    expect(pinHashEquals(h, h)).toBe(true);
  });
  it("hash beda -> false", () => {
    expect(pinHashEquals(hashPin("1111"), hashPin("2222"))).toBe(false);
  });
  it("panjang beda -> false (tanpa throw)", () => {
    expect(pinHashEquals("abc", "abcdef")).toBe(false);
  });
});

describe("haversineMeters (geofence)", () => {
  it("titik sama -> 0 meter", () => {
    expect(haversineMeters(3.32, 99.16, 3.32, 99.16)).toBeCloseTo(0, 5);
  });
  it("1 derajat lintang ~111 km", () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
  it("jarak kecil terdeteksi (radius outlet)", () => {
    // ~0.001 derajat ≈ 111 m
    const d = haversineMeters(3.3200, 99.1600, 3.3210, 99.1600);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(130);
  });
});

describe("evaluatePunchStatus", () => {
  it("tanpa jadwal shift -> normal", () => {
    expect(
      evaluatePunchStatus({ action: "in", punchAt: new Date(), startTime: null, endTime: null }),
    ).toBe("normal");
    expect(
      evaluatePunchStatus({ action: "out", punchAt: new Date(), startTime: null, endTime: null }),
    ).toBe("normal");
  });
});

describe("attendanceStatusLabel", () => {
  it("memetakan status ke label Indonesia", () => {
    expect(attendanceStatusLabel("late")).toBe("Telat");
    expect(attendanceStatusLabel("early_leave")).toBe("Pulang Cepat");
    expect(attendanceStatusLabel("on_time")).toBe("Tepat Waktu");
    expect(attendanceStatusLabel("normal")).toBe("Normal");
    expect(attendanceStatusLabel("apa-saja")).toBe("Normal");
  });
});

describe("formatWorkedHours", () => {
  it("menit -> 'Xj Ym'", () => {
    expect(formatWorkedHours(0)).toBe("0j 0m");
    expect(formatWorkedHours(59)).toBe("0j 59m");
    expect(formatWorkedHours(60)).toBe("1j 0m");
    expect(formatWorkedHours(125)).toBe("2j 5m");
    expect(formatWorkedHours(480)).toBe("8j 0m");
  });
});
