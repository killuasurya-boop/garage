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
  WELCOME_VOUCHER,
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

  it("guest: hanya promo umum, tanpa kode, tanpa voucher pribadi siapa pun", () => {
    const offers = getEligibleCustomerOffers({ viewer: { kind: "guest" }, vouchers: list, now });
    expect(offers.map((o) => o.id)).toEqual(["general"]);
    expect(offers[0].code).toBeNull();
  });

  it("member: voucher miliknya + umum; tidak bocor milik orang lain; yang sudah dipakai disaring", () => {
    const offers = getEligibleCustomerOffers({ viewer: { kind: "member", customerId: "c1", tier: "Silver" }, vouchers: list, now });
    expect(offers.map((o) => o.id)).toEqual(["mine", "general"]);
    expect(offers[0]).toMatchObject({ kind: "welcome", code: "WELCOME-ABC", expiringSoon: true });
    const afterUse = getEligibleCustomerOffers({
      viewer: { kind: "member", customerId: "c1", tier: "Silver" },
      vouchers: list,
      redeemedVoucherIds: ["mine"],
      now,
    });
    expect(afterUse.map((o) => o.id)).toEqual(["general"]);
  });
});

describe("benefit terverifikasi", () => {
  it("memakai aturan poin dari Pengaturan, bukan perk yang belum ada", () => {
    const silver = verifiedTierBenefits("Silver", rules, { includeWelcome: true });
    expect(silver.map((b) => b.key)).toEqual(["points", "redeem", "member-promo", "welcome"]);
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
    expect(off.map((b) => b.key)).toEqual(["member-promo"]);
  });

  it("welcome voucher sama dengan yang diterbitkan registerMember", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/member-service.ts"), "utf8");
    const block = source.slice(source.indexOf("async function issueWelcomeVoucher"), source.indexOf("function upgradeMessage"));
    expect(block).toContain(`value: ${WELCOME_VOUCHER.percent},`);
    expect(block).toContain(`maxDiscount: ${WELCOME_VOUCHER.maxDiscount.toLocaleString("en-US").replace(/,/g, "_")},`);
    expect(block).toContain(`${WELCOME_VOUCHER.days} * 24 * 60 * 60 * 1000`);
    expect(block).toContain("usageLimit: 1");
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
