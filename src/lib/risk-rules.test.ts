import { describe, expect, it } from "vitest";

import { evaluateSessionRisk, type RiskSessionFacts } from "@/lib/risk-rules";

const NOW = new Date("2026-10-28T10:00:00Z");

function facts(over: Partial<RiskSessionFacts> = {}): RiskSessionFacts {
  return {
    sessionId: "s-1",
    code: "CS-1",
    outletId: "o-1",
    businessDate: "2026-10-27",
    closedAt: new Date("2026-10-27T15:00:00Z"),
    cashierId: "u-kasir",
    cashierName: "Kasir",
    expectedCash: 100_000,
    actualCash: 100_000,
    discrepancy: 0,
    ledgerBalance: 100_000,
    countSkippedReason: null,
    qrisDiscrepancy: null,
    reviewSelfVerified: false,
    reviewedBy: null,
    countKinds: ["count_1", "count_2"],
    refundVoidCount: 0,
    methodFixCount: 0,
    unconfirmedDeposits: [],
    history: { shifts: 1, shortageShifts: 0, mismatchShifts: 0 },
    threshold: 50_000,
    now: NOW,
    ...over,
  };
}

const rules = (f: RiskSessionFacts) => evaluateSessionRisk(f).map((a) => [a.ruleId, a.riskLevel]);

describe("risk-rules (PRD §14)", () => {
  it("shift bersih → tidak ada alert", () => {
    expect(evaluateSessionRisk(facts())).toEqual([]);
  });

  it("kekurangan berjenjang menurut nominal vs ambang", () => {
    expect(rules(facts({ discrepancy: -5_000, actualCash: 95_000 }))).toEqual([["CASH_SHORTAGE", 2]]);
    expect(rules(facts({ discrepancy: -30_000, actualCash: 70_000 }))).toEqual([["CASH_SHORTAGE", 3]]);
    expect(rules(facts({ discrepancy: -60_000, actualCash: 40_000 }))).toEqual([["CASH_SHORTAGE", 4]]);
  });

  it("kelebihan bukan pendapatan; hitungan #3 = LV2; berulang memakai pembanding shift", () => {
    expect(rules(facts({ discrepancy: 20_000 }))).toEqual([["CASH_SURPLUS", 2]]);
    expect(rules(facts({ countKinds: ["count_1", "count_2", "count_3"] }))).toEqual([["COUNT_MISMATCH", 2]]);
    const repeat = evaluateSessionRisk(
      facts({ countKinds: ["count_1", "count_2", "count_3"], history: { shifts: 10, shortageShifts: 0, mismatchShifts: 3 } }),
    );
    const alert = repeat.find((a) => a.ruleId === "COUNT_MISMATCH_REPEAT")!;
    expect(alert).toMatchObject({ riskLevel: 3, dedupeKey: "COUNT_MISMATCH_REPEAT:u-kasir:2026-10" });
    expect(alert.explanation).toContain("3 dari 10 shift");
  });

  it("QRIS & setoran bukan custody laci kasir (PRD §14.5)", () => {
    const out = evaluateSessionRisk(
      facts({
        qrisDiscrepancy: -15_000,
        unconfirmedDeposits: [
          { id: "m-new", amount: 50_000, recordedAt: new Date(NOW.getTime() - 2 * 3_600_000), ref: "KAS-1" },
          { id: "m-old", amount: 80_000, recordedAt: new Date(NOW.getTime() - 30 * 3_600_000), ref: "KAS-2" },
        ],
      }),
    );
    expect(out.map((a) => [a.ruleId, a.custodyScope, a.personUserId])).toEqual([
      ["QRIS_MISMATCH", "qris", null],
      ["DEPOSIT_UNCONFIRMED", "bank", null],
    ]);
    expect(out[1].dedupeKey).toBe("DEPOSIT_UNCONFIRMED:m-old");
  });

  it("buku kas ≠ cache → LV5 sistem; tutup darurat → LV3 bukti sebagian", () => {
    expect(rules(facts({ ledgerBalance: 90_000 }))).toEqual([["LEDGER_CACHE_MISMATCH", 5]]);
    const emergency = evaluateSessionRisk(facts({ countSkippedReason: "Printer mati", countKinds: [] }));
    expect(emergency[0]).toMatchObject({ ruleId: "EMERGENCY_CLOSE", riskLevel: 3, completeness: "partial" });
  });

  it("bahasa netral: tidak pernah menuduh", () => {
    const all = evaluateSessionRisk(
      facts({
        discrepancy: -60_000,
        actualCash: 40_000,
        countKinds: ["count_1", "count_2", "count_3"],
        history: { shifts: 5, shortageShifts: 4, mismatchShifts: 2 },
        refundVoidCount: 4,
        methodFixCount: 3,
        reviewSelfVerified: true,
      }),
    );
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const alert of all) {
      expect(`${alert.title} ${alert.explanation}`).not.toMatch(/curi|curang|pencuri|penipu/i);
    }
  });
});
