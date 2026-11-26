import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  customerSegments,
  getEligibleCustomerOffers,
  tierProgressBySpend,
  tierShowcase,
  verifiedTierBenefits,
  voucherEffectiveStatus,
  type VoucherLike,
} from "@/lib/customer-offers";

const now = new Date("2026-11-06T10:00:00Z");
const day = 86_400_000;

function voucher(partial: Partial<VoucherLike>): VoucherLike {
  return {
    id: partial.id ?? "v1",
    code: partial.code ?? "PROMO10",
    title: partial.title ?? "Promo member",
    type: partial.type ?? "percent",
    value: partial.value ?? 10,
    minSpend: partial.minSpend ?? 0,
    maxDiscount: partial.maxDiscount ?? null,
    audience: partial.audience ?? "all",
    status: partial.status ?? "active",
    startsAt: partial.startsAt ?? null,
    endsAt: partial.endsAt ?? new Date(now.getTime() + 10 * day),
    usageLimit: partial.usageLimit ?? null,
    usedCount: partial.usedCount ?? 0,
    customerId: partial.customerId ?? null,
  };
}

const rules = { pointsPerThousand: 0.5, pointValue: 100, redeemMaxPct: 50, redeemMinPoints: 50 };

describe("voucherEffectiveStatus", () => {
  it("status 'active' dengan tanggal akhir lewat = kedaluwarsa", () => {
    expect(voucherEffectiveStatus(voucher({ endsAt: new Date(now.getTime() - 1) }), now)).toBe("expired");
    expect(voucherEffectiveStatus(voucher({ startsAt: new Date(now.getTime() + day) }), now)).toBe("scheduled");
    expect(voucherEffectiveStatus(voucher({ usageLimit: 5, usedCount: 5 }), now)).toBe("quota_exhausted");
    expect(voucherEffectiveStatus(voucher({ status: "paused" }), now)).toBe("inactive");
    expect(voucherEffectiveStatus(voucher({}), now)).toBe("active");
  });
});

describe("getEligibleCustomerOffers", () => {
  const list = [
    voucher({ id: "general", code: "MEMBER15" }),
    voucher({ id: "expired", endsAt: new Date(now.getTime() - day) }),
    voucher({ id: "quota", usageLimit: 1, usedCount: 1 }),
    voucher({ id: "guest-only", audience: "guest" }),
    voucher({ id: "mine", code: "WELCOME-ABC", customerId: "c1", endsAt: new Date(now.getTime() + day) }),
    voucher({ id: "theirs", code: "PERSONAL-X", customerId: "c2" }),
  ];

  // Owner 25 Nov 2026: semua voucher dimatikan (voucher-policy.ts) — tidak ada penawaran voucher untuk siapa pun.
  it("voucher dimatikan: guest & member tidak mendapat penawaran voucher apa pun", () => {
    expect(getEligibleCustomerOffers({ viewer: { kind: "guest" }, vouchers: list, now })).toEqual([]);
    expect(getEligibleCustomerOffers({ viewer: { kind: "member", customerId: "c1", tier: "Silver" }, vouchers: list, now })).toEqual([]);
  });
});

describe("benefit terverifikasi", () => {
  it("memakai aturan poin dari Pengaturan, bukan perk yang belum ada", () => {
    const silver = verifiedTierBenefits("Silver", rules);
    // Tanpa "Voucher & promo member" dan "Welcome reward" (voucher dimatikan Owner 25 Nov 2026).
    expect(silver.map((b) => b.key)).toEqual(["points", "redeem"]);
    expect(JSON.stringify(silver)).not.toMatch(/voucher|welcome/i);
    expect(silver[0].detail).toContain("Rp100.000 = 50 poin");
    expect(silver[1].detail).toContain("1 poin = Rp100");
    const gold = verifiedTierBenefits("Gold", rules);
    expect(gold[0].title).toBe("Poin 1,2x");
    expect(gold[0].detail).toContain("= 60 poin");
    const all = JSON.stringify(tierShowcase(rules));
    expect(all).not.toMatch(/free monthly drink|birthday reward|prototype|exclusive event/i);
  });

  it("poin & tukar poin tidak dijanjikan bila dimatikan", () => {
    const off = verifiedTierBenefits("Silver", { ...rules, pointsPerThousand: 0, redeemMaxPct: 0 });
    expect(off).toEqual([]);
  });

  it("pendaftaran member tidak lagi menerbitkan voucher (Owner 25 Nov 2026)", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/member-service.ts"), "utf8");
    expect(source).not.toContain("issueWelcomeVoucher");
    expect(source).not.toMatch(/insert\(vouchers\)/);
  });
});

describe("tierProgressBySpend", () => {
  it("progres dari belanja 12 bulan; Platinum/Ultra tanpa target otomatis", () => {
    expect(tierProgressBySpend(1_500_000, "Silver")).toMatchObject({ next: "Gold", remaining: 500_000, percent: 75 });
    expect(tierProgressBySpend(3_500_000, "Gold")).toMatchObject({ next: "Platinum", remaining: 1_500_000, percent: 50 });
    expect(tierProgressBySpend(9_000_000, "Ultra")).toMatchObject({ next: null, percent: 100 });
  });
});

describe("customerSegments", () => {
  it("segmen deterministik", () => {
    expect(
      customerSegments({ isMember: true, paidOrders: 3, lastPaidAt: new Date(now.getTime() - 5 * day), progressRemaining: 100_000, progressSpan: 2_000_000, now }),
    ).toEqual(["returning_customer", "active_member", "near_next_tier"]);
    expect(
      customerSegments({ isMember: true, paidOrders: 1, lastPaidAt: new Date(now.getTime() - 60 * day), voucherEndsAt: [new Date(now.getTime() + day)], now }),
    ).toEqual(["new_customer", "inactive_member", "voucher_expiring"]);
  });
});
