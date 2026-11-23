import { describe, expect, it } from "vitest";

import { applyFundRequest, fundDecisionSchema, fundRequestInputSchema, proofContentMatches } from "@/lib/event-fund-request-rules";
import { EMPTY_PUBLIC_FINANCE } from "@/lib/event-public-finance-rules";

const EV = "00000000-0000-4000-8000-000000000001";
const finance = { ...EMPTY_PUBLIC_FINANCE, budgetLines: [{ code: "02", name: "Sound", budget: 5_000_000, purpose: "", pic: "", needsVendor: true, contracted: 0, stage: "belum-dipesan" as const }] };

describe("fundRequestInputSchema", () => {
  it("dana keluar wajib pos RAB; dana masuk wajib asal dana; maks Rp2 miliar", () => {
    expect(fundRequestInputSchema.safeParse({ eventId: EV, kind: "keluar", date: "2026-11-23", amount: "500000" }).success).toBe(false);
    expect(fundRequestInputSchema.safeParse({ eventId: EV, kind: "masuk", date: "2026-11-23", amount: 500000 }).success).toBe(false);
    expect(fundRequestInputSchema.safeParse({ eventId: EV, kind: "masuk", date: "2026-11-23", amount: 2_500_000_000, party: "X" }).success).toBe(false);
    const ok = fundRequestInputSchema.parse({ eventId: EV, kind: "keluar", date: "2026-11-23", amount: "500000", budgetCode: "02", payKind: "dp" });
    expect(ok).toMatchObject({ amount: 500000, budgetCode: "02", payKind: "dp" });
  });
  it("tolak wajib alasan; sahkan tidak", () => {
    expect(fundDecisionSchema.safeParse({ action: "tolak" }).success).toBe(false);
    expect(fundDecisionSchema.safeParse({ action: "sahkan" }).success).toBe(true);
  });
});

describe("applyFundRequest", () => {
  it("masuk → incomes; keluar → expenses dengan kode pos yang ada; pos tak dikenal ditolak", () => {
    const a = applyFundRequest(finance, { kind: "masuk", date: "2026-11-23", amount: 1000, party: "Sponsor A", budgetCode: null, payKind: "", description: "" });
    expect("finance" in a && a.finance.incomes).toEqual([{ date: "2026-11-23", from: "Sponsor A", amount: 1000 }]);
    const b = applyFundRequest(finance, { kind: "keluar", date: "2026-11-23", amount: 2000, party: "Sound Jaya", budgetCode: "02", payKind: "dp", description: "DP sound" });
    expect("finance" in b && b.finance.expenses).toEqual([{ date: "2026-11-23", code: "02", description: "ke Sound Jaya · DP sound", payKind: "dp", amount: 2000 }]);
    expect(applyFundRequest(finance, { kind: "keluar", date: "2026-11-23", amount: 1, party: "", budgetCode: "99", payKind: "", description: "" })).toHaveProperty("error");
  });
  it("kapasitas 300 dijaga", () => {
    const full = { ...finance, incomes: Array.from({ length: 300 }, () => ({ date: "2026-11-01", from: "x", amount: 1 })) };
    expect(applyFundRequest(full, { kind: "masuk", date: "2026-11-23", amount: 1, party: "y", budgetCode: null, payKind: "", description: "" })).toHaveProperty("error");
  });
});

describe("proofContentMatches", () => {
  it("cocokkan magic bytes", () => {
    expect(proofContentMatches(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), ".jpg")).toBe(true);
    expect(proofContentMatches(new Uint8Array([0x25, 0x50, 0x44, 0x46]), ".jpg")).toBe(false);
    expect(proofContentMatches(new Uint8Array([0x25, 0x50, 0x44, 0x46]), ".pdf")).toBe(true);
  });
});
