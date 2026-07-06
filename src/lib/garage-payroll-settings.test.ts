import { describe, it, expect } from "vitest";

import {
  computeLatePercent,
  haversineDistanceMeters,
  isRoleEligibleForFeePool,
  MANAGER_ROLES,
  PAYROLL_DEFAULTS,
  PAYROLL_KEYS,
} from "@/lib/garage-payroll-settings";

describe("computeLatePercent", () => {
  const brackets = PAYROLL_DEFAULTS[PAYROLL_KEYS.lateBrackets] as Array<{
    maxMinutes: number | null;
    percent: number;
  }>;

  it("returns 100% for on-time (≤15 min)", () => {
    expect(computeLatePercent(0, brackets)).toBe(100);
    expect(computeLatePercent(15, brackets)).toBe(100);
  });

  it("returns 75% for 15–60 min late", () => {
    expect(computeLatePercent(16, brackets)).toBe(75);
    expect(computeLatePercent(60, brackets)).toBe(75);
  });

  it("returns 50% for 60–120 min late", () => {
    expect(computeLatePercent(61, brackets)).toBe(50);
    expect(computeLatePercent(120, brackets)).toBe(50);
  });

  it("returns 0% for >120 min (absent)", () => {
    expect(computeLatePercent(121, brackets)).toBe(0);
    expect(computeLatePercent(500, brackets)).toBe(0);
  });

  it("handles negative lateness as 0 (early)", () => {
    expect(computeLatePercent(-30, brackets)).toBe(100);
  });
});

describe("haversineDistanceMeters", () => {
  it("returns ~0 for identical coords", () => {
    expect(haversineDistanceMeters(3.328, 99.161, 3.328, 99.161)).toBeLessThan(1);
  });

  it("returns realistic distance between two nearby points (~110m per 0.001° lat)", () => {
    const d = haversineDistanceMeters(3.328, 99.161, 3.329, 99.161);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});

describe("isRoleEligibleForFeePool", () => {
  const exclude = Array.from(MANAGER_ROLES);

  it("excludes all manager roles", () => {
    for (const r of exclude) {
      expect(isRoleEligibleForFeePool(r, exclude)).toBe(false);
    }
  });

  it("includes typical staff roles", () => {
    expect(isRoleEligibleForFeePool("Barista", exclude)).toBe(true);
    expect(isRoleEligibleForFeePool("Koki", exclude)).toBe(true);
    expect(isRoleEligibleForFeePool("Kasir", exclude)).toBe(true);
    expect(isRoleEligibleForFeePool("Waiter 1", exclude)).toBe(true);
    expect(isRoleEligibleForFeePool("Gudang", exclude)).toBe(true);
  });

  it("rejects empty role", () => {
    expect(isRoleEligibleForFeePool("", exclude)).toBe(false);
  });
});
