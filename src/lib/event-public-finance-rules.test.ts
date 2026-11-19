import { describe, expect, it } from "vitest";

import { prefillFromPlatform, publicFinanceSchema, publicFinanceTotals, toPlatformFinance, toPlatformSummary } from "@/lib/event-public-finance-rules";

// Transparansi dana publik (Owner 18 Nov 2026): angka bebas dari Owner → bentuk yang dibaca halaman event platform.
const data = publicFinanceSchema.parse({
  target: 21_300_000,
  notes: ["RAB sementara"],
  budgetLines: [
    { code: "01", name: "Band", budget: 3_200_000, purpose: "Honor band", pic: "Ace", contracted: 3_200_000, stage: "dp" },
    { code: "02", name: "Sound", budget: 10_000_000 },
  ],
  incomes: [
    { date: "2026-11-10", from: "Kopi Sponsor", amount: 1_000_000 },
    { date: "2026-11-15", from: "", amount: 500_000 },
  ],
  expenses: [{ date: "2026-11-16", code: "01", description: "DP band", payKind: "dp", amount: 1_600_000 }],
  committedCount: 2,
  committedAmount: 2_500_000,
});

describe("publicFinanceSchema", () => {
  it("menolak kode pos dobel dan dana keluar ke pos yang tidak ada", () => {
    const dup = publicFinanceSchema.safeParse({ ...data, budgetLines: [...data.budgetLines, { ...data.budgetLines[0] }] });
    expect(dup.success).toBe(false);
    const orphan = publicFinanceSchema.safeParse({ ...data, expenses: [{ date: "2026-11-16", code: "99", amount: 1 }] });
    expect(orphan.success).toBe(false);
  });
});

describe("bentuk halaman event", () => {
  it("config.finance: target, pos RAB, catatan", () => {
    expect(toPlatformFinance(data, true)).toEqual({
      target: 21_300_000,
      budgetLines: [
        { code: "01", name: "Band", budget: 3_200_000, purpose: "Honor band", pic: "Ace", needsVendor: true },
        { code: "02", name: "Sound", budget: 10_000_000, purpose: "", pic: "", needsVendor: true },
      ],
      notes: ["RAB sementara"],
      showVendorNames: true,
    });
  });

  it("sponsor/summary: total, riwayat (12.00 WIB), realisasi per pos, tahap & komitmen", () => {
    const s = toPlatformSummary(data);
    expect(s).toMatchObject({ verified_amount: 1_500_000, verified_expense: 1_600_000, balance: -100_000, transaction_count: 3, committed_count: 2, committed_amount: 2_500_000, contracted_total: 3_200_000 });
    expect(s.income_history[0]).toEqual({ sponsor: null, amount: 500_000, approved_at: "2026-11-15 05:00:00", budget_code: null });
    expect(s.expenses).toEqual([{ budget_code: "01", amount: 1_600_000 }]);
    expect(s.budget_status).toEqual([
      { code: "01", budget: 3_200_000, contracted: 3_200_000, paid: 1_600_000, stage: "dp", vendors: [] },
      { code: "02", budget: 10_000_000, contracted: 0, paid: 0, stage: "belum-dipesan", vendors: [] },
    ]);
    expect(publicFinanceTotals(data).percent).toBe(7);
  });

  it("isian awal dari platform: data rusak/aneh dibersihkan, tidak dipercaya mentah", () => {
    const pre = prefillFromPlatform(
      { finance: { target: 17_000_000, budgetLines: [{ code: "01", name: "Band", budget: 3_200_000, needsVendor: true }], notes: ["a", 5] } },
      { budget_status: [{ code: "01", contracted: 1000, stage: "aneh" }], income_history: [{ sponsor: "X", amount: 200, approved_at: "2026-11-01 03:00:00" }], expense_history: [{ budget_code: "77", amount: 5, approved_at: "2026-11-02" }], committed_count: 1 },
    );
    expect(pre).toMatchObject({ target: 17_000_000, notes: ["a"], committedCount: 1, incomes: [{ date: "2026-11-01", from: "X", amount: 200 }], expenses: [] });
    expect(pre.budgetLines[0]).toMatchObject({ code: "01", contracted: 1000, stage: "belum-dipesan" });
    expect(publicFinanceSchema.safeParse(pre).success).toBe(true);
  });
});

describe("financeChangeSummary (riwayat perubahan halaman event)", () => {
  it("format sama dengan platform; tanpa perubahan target/RAB → kosong", async () => {
    const { financeChangeSummary, EMPTY_PUBLIC_FINANCE } = await import("@/lib/event-public-finance-rules");
    const line = (code: string, name: string, budget: number) => ({ code, name, budget, purpose: "", pic: "", needsVendor: true, contracted: 0, stage: "belum-dipesan" as const });
    const before = { ...EMPTY_PUBLIC_FINANCE, target: 17_000_000, budgetLines: [line("02", "Sound", 4_500_000), line("06", "Kembang Api", 1_000_000)] };
    const after = { ...before, target: 21_300_000, budgetLines: [line("02", "Sound (LIGHTING)", 10_000_000), line("09", "MC", 1_200_000)] };
    expect(financeChangeSummary(before, after)).toBe(
      'Target 17.000.000 → 21.300.000; Pos 02 Sound (LIGHTING): Rp4.500.000 → Rp10.000.000; Pos 02 berganti nama "Sound" → "Sound (LIGHTING)"; Pos 09 MC ditambah: Rp1.200.000; Pos 06 Kembang Api dihapus',
    );
    expect(financeChangeSummary(before, { ...before, notes: ["x"] })).toBe("");
    expect(financeChangeSummary(null, after)).toBe("");
  });
});
