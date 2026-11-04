import { describe, expect, it } from "vitest";

import { DIZZY_SPEED, RUN_SPEED, WALK_SPEED, clampPetPosition, nextDragSpeed, pickWalkTarget } from "@/components/garage/aya/aya-floating-pet";

const phone = { width: 390, height: 844 };

describe("Aya melayang — posisi", () => {
  it("selalu terlihat utuh di layar", () => {
    expect(clampPetPosition({ x: -50, y: -20 }, phone)).toEqual({ x: 8, y: 8 });
    expect(clampPetPosition({ x: 999, y: 9999 }, phone)).toEqual({ x: 390 - 72 - 8, y: 844 - 72 - 8 });
    expect(clampPetPosition({ x: 100, y: 300 }, phone)).toEqual({ x: 100, y: 300 });
  });

  it("jalan-jalan sendiri tetap di jalurnya (tinggi sama) dan selalu terlihat utuh", () => {
    const start = { x: 160, y: 600 };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const { target, seconds } = pickWalkTarget(start, phone, () => r);
      expect(target.y).toBe(600);
      expect(target.x).toBeGreaterThanOrEqual(8);
      expect(target.x).toBeLessThanOrEqual(390 - 72 - 8);
      // Benar-benar berpindah supaya langkahnya terlihat.
      expect(Math.abs(target.x - start.x)).toBeGreaterThanOrEqual(60);
      expect(seconds).toBeGreaterThanOrEqual(0.7);
      expect(seconds).toBeLessThanOrEqual(3.2);
    }
  });

  it("jarak jauh = berlari (lebih cepat), jarak dekat = berjalan", () => {
    const tablet = { width: 1024, height: 768 };
    const far = pickWalkTarget({ x: 8, y: 500 }, tablet, () => 0.999);
    expect(far.gait).toBe("run");
    expect(far.seconds).toBeCloseTo(Math.min(3.2, Math.max(0.7, Math.abs(far.target.x - 8) / RUN_SPEED)), 1);
    const near = pickWalkTarget({ x: 400, y: 500 }, tablet, () => 0.45);
    expect(near.gait).toBe("walk");
    expect(near.seconds).toBeCloseTo(Math.min(3.2, Math.max(0.7, Math.abs(near.target.x - 400) / WALK_SPEED)), 1);
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
