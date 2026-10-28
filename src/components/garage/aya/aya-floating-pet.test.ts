import { describe, expect, it } from "vitest";

import { clampPetPosition, pickRoamTarget } from "@/components/garage/aya/aya-floating-pet";

const phone = { width: 390, height: 844 };

describe("Aya melayang — posisi", () => {
  it("selalu terlihat utuh di layar", () => {
    expect(clampPetPosition({ x: -50, y: -20 }, phone)).toEqual({ x: 8, y: 8 });
    expect(clampPetPosition({ x: 999, y: 9999 }, phone)).toEqual({ x: 390 - 72 - 8, y: 844 - 72 - 8 });
    expect(clampPetPosition({ x: 100, y: 300 }, phone)).toEqual({ x: 100, y: 300 });
  });

  it("terbang sendiri tidak ke header atau bar keranjang bawah", () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const target = pickRoamTarget(phone, () => r);
      expect(target.y).toBeGreaterThanOrEqual(72);
      expect(target.y).toBeLessThanOrEqual(844 - 72 - 140);
      expect(target.x).toBeGreaterThanOrEqual(8);
      expect(target.x).toBeLessThanOrEqual(390 - 72 - 8);
    }
  });
});
