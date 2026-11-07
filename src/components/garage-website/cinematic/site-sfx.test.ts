import { describe, expect, it } from "vitest";

import { SITE_SFX, SITE_SFX_GAP_MS, playSiteSfx, readSiteSound, siteSfxAllowed } from "./site-sfx";

describe("suara website (Cinematic UI V1)", () => {
  it("tujuh efek sesuai brief, semua punya jeda", () => {
    expect(Object.keys(SITE_SFX).sort()).toEqual(["carousel", "click", "entrance", "laser", "shimmer", "sweep", "tick"]);
    for (const name of Object.keys(SITE_SFX) as (keyof typeof SITE_SFX)[]) expect(SITE_SFX_GAP_MS[name]).toBeGreaterThan(0);
  });

  it("default MATI dan tidak berbunyi di server", () => {
    expect(readSiteSound()).toBe(false);
    expect(playSiteSfx("entrance")).toBe(false);
  });

  it("jeda antarefek mencegah suara beruntun", () => {
    const last = new Map([["tick", 1000]] as const);
    expect(siteSfxAllowed(last, "tick", 1050)).toBe(false);
    expect(siteSfxAllowed(last, "tick", 1100)).toBe(true);
    expect(siteSfxAllowed(last, "click", 1001)).toBe(true);
  });
});
