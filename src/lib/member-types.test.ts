import { describe, it, expect } from "vitest";

import {
  GOLD_MIN_POINTS,
  PLATINUM_MIN_POINTS,
  calculateEarnedPoints,
  calculateRedeemDiscount,
  memberLevelForPoints,
  memberLevelRank,
  memberProgress,
  normalizeMemberLevel,
} from "@/lib/member-types";

// Logika ini dekat-uang (poin loyalitas → diskon). Test memastikan aturan
// tidak berubah tanpa sengaja. Aturan: 1 poin / Rp1.000; redeem 100 poin = Rp10.000;
// multiplier Silver 1x, Gold 1.2x, Platinum 1.5x. Gold ≥2000 poin, Platinum ≥5000.

describe("member-types: konstanta threshold", () => {
  it("Gold mulai 2000 poin (Rp2jt), Platinum 5000 poin (Rp5jt)", () => {
    expect(GOLD_MIN_POINTS).toBe(2000);
    expect(PLATINUM_MIN_POINTS).toBe(5000);
  });
});

describe("calculateEarnedPoints", () => {
  it("Silver: 1 poin per Rp1.000 (floor)", () => {
    expect(calculateEarnedPoints(50_000, "Silver").pointsEarned).toBe(50);
    expect(calculateEarnedPoints(999, "Silver").pointsEarned).toBe(0); // < Rp1.000
    expect(calculateEarnedPoints(1_500, "Silver").pointsEarned).toBe(1); // floor
  });

  it("Gold multiplier 1.2x (floor)", () => {
    // base 50 * 1.2 = 60
    expect(calculateEarnedPoints(50_000, "Gold").pointsEarned).toBe(60);
    // base 33 * 1.2 = 39.6 -> floor 39
    expect(calculateEarnedPoints(33_000, "Gold").pointsEarned).toBe(39);
  });

  it("Platinum multiplier 1.5x", () => {
    expect(calculateEarnedPoints(50_000, "Platinum").pointsEarned).toBe(75);
  });

  it("level tidak dikenal jatuh ke Silver (multiplier 1)", () => {
    expect(calculateEarnedPoints(50_000, "Bukan Level").pointsEarned).toBe(50);
  });

  it("amount 0 / negatif tidak menghasilkan poin negatif untuk 0", () => {
    expect(calculateEarnedPoints(0, "Silver").pointsEarned).toBe(0);
  });
});

describe("calculateRedeemDiscount", () => {
  it("100 poin = Rp10.000 (kelipatan)", () => {
    expect(calculateRedeemDiscount(100)).toBe(10_000);
    expect(calculateRedeemDiscount(250)).toBe(20_000); // floor 2 unit
    expect(calculateRedeemDiscount(99)).toBe(0); // < 1 unit
  });
});

describe("memberLevelForPoints", () => {
  it("Silver < 2000, Gold 2000–4999, Platinum ≥ 5000", () => {
    expect(memberLevelForPoints(0)).toBe("Silver");
    expect(memberLevelForPoints(1_999)).toBe("Silver");
    expect(memberLevelForPoints(2_000)).toBe("Gold");
    expect(memberLevelForPoints(4_999)).toBe("Gold");
    expect(memberLevelForPoints(5_000)).toBe("Platinum");
    expect(memberLevelForPoints(999_999)).toBe("Platinum");
  });
});

describe("normalizeMemberLevel", () => {
  it("hanya nilai valid; sisanya Silver", () => {
    expect(normalizeMemberLevel("Ultra")).toBe("Ultra");
    expect(normalizeMemberLevel("Platinum")).toBe("Platinum");
    expect(normalizeMemberLevel("Gold")).toBe("Gold");
    expect(normalizeMemberLevel("Silver")).toBe("Silver");
    expect(normalizeMemberLevel(null)).toBe("Silver");
    expect(normalizeMemberLevel("ngawur")).toBe("Silver");
  });
});

describe("memberLevelRank", () => {
  it("urutan Silver<Gold<Platinum<Ultra", () => {
    expect(memberLevelRank("Silver")).toBeLessThan(memberLevelRank("Gold"));
    expect(memberLevelRank("Gold")).toBeLessThan(memberLevelRank("Platinum"));
    expect(memberLevelRank("Platinum")).toBeLessThan(memberLevelRank("Ultra"));
  });
});

describe("memberProgress", () => {
  it("Silver awal: 0% menuju Gold", () => {
    const p = memberProgress(0);
    expect(p.currentLevel).toBe("Silver");
    expect(p.nextLevel).toBe("Gold");
    expect(p.percent).toBe(0);
    expect(p.remaining).toBe(GOLD_MIN_POINTS);
  });

  it("Platinum: progress penuh, tanpa next", () => {
    const p = memberProgress(PLATINUM_MIN_POINTS);
    expect(p.currentLevel).toBe("Platinum");
    expect(p.nextLevel).toBeNull();
    expect(p.percent).toBe(100);
  });

  it("setengah jalan Silver→Gold ~50%", () => {
    const p = memberProgress(GOLD_MIN_POINTS / 2);
    expect(p.currentLevel).toBe("Silver");
    expect(p.percent).toBe(50);
  });
});
