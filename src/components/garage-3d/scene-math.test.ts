import { describe, expect, it } from "vitest";

import { adaptAction, clamp01, damp, decideScene, fitDistance } from "./scene-math";

const base = { reducedMotion: false, saveData: false, coarsePointer: false, width: 1366 };

describe("adegan 3D emblem Garage", () => {
  it("hemat data = mati (tidak mengunduh three.js)", () => {
    expect(decideScene({ ...base, saveData: true }).mode).toBe("off");
  });

  it("reduced-motion = satu bingkai diam, bukan animasi", () => {
    expect(decideScene({ ...base, reducedMotion: true }).mode).toBe("static");
    expect(decideScene(base).mode).toBe("animated");
  });

  it("perangkat lemah & HP kecil = kualitas rendah; desktop biasa = tinggi", () => {
    expect(decideScene(base).quality).toBe("high");
    expect(decideScene({ ...base, deviceMemory: 2 }).quality).toBe("low");
    expect(decideScene({ ...base, cores: 2 }).quality).toBe("low");
    expect(decideScene({ ...base, coarsePointer: true, width: 390 }).quality).toBe("low");
    expect(decideScene({ ...base, coarsePointer: true, width: 1024 }).quality).toBe("high");
  });

  it("jarak kamera: layar sempit butuh kamera lebih jauh agar lingkaran tidak terpotong", () => {
    const wide = fitDistance(32, 16 / 9, 3);
    const narrow = fitDistance(32, 0.5, 3);
    expect(narrow).toBeGreaterThan(wide);
    expect(wide).toBeCloseTo(3 / Math.tan((32 * Math.PI) / 360), 5);
  });

  it("clamp01 & damp stabil", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(3)).toBe(1);
    expect(damp(0, 1, 6, 0)).toBe(0);
    expect(damp(0, 1, 6, 10)).toBeCloseTo(1, 5);
    const a = damp(damp(0, 1, 4, 0.016), 1, 4, 0.016);
    const b = damp(0, 1, 4, 0.032);
    expect(a).toBeCloseTo(b, 6); // sama untuk dua bingkai kecil vs satu bingkai besar
  });

  it("adaptasi kualitas: turunkan dulu, berhenti bila tetap berat", () => {
    expect(adaptAction(0.016, false)).toBe("keep");
    expect(adaptAction(0.04, false)).toBe("downgrade");
    expect(adaptAction(0.05, true)).toBe("stop");
    expect(adaptAction(0.03, true)).toBe("keep");
  });
});
