import { describe, expect, it } from "vitest";

import { DIZZY_SPEED, clampPetPosition, nextDragSpeed, pickRoamTarget } from "@/components/garage/aya/aya-floating-pet";

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

  it("pusing hanya bila dilempar kencang, bukan karena satu sentakan", () => {
    // Seret pelan & stabil 0,5 px/ms → tidak pusing.
    let speed = 0;
    for (let i = 0; i < 10; i += 1) speed = nextDragSpeed(speed, 8, 16);
    expect(speed).toBeLessThan(DIZZY_SPEED);
    // Satu sentakan kecil di tengah seret pelan → tetap tidak pusing.
    expect(nextDragSpeed(speed, 24, 16)).toBeLessThan(DIZZY_SPEED);
    // Dilempar kencang beberapa frame (± 3 px/ms) → pusing.
    speed = 0;
    for (let i = 0; i < 5; i += 1) speed = nextDragSpeed(speed, 48, 16);
    expect(speed).toBeGreaterThan(DIZZY_SPEED);
    // Waktu nol tidak membuat kecepatan meledak.
    expect(nextDragSpeed(0.7, 30, 0)).toBe(0.7);
  });
});
