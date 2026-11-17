import { describe, expect, it } from "vitest";

import { budgetSummary, eventProfit } from "@/lib/event-finance-rules";

describe("budgetSummary", () => {
  it("realisasi hanya pembayaran posted; lebih bayar & sisa per pos dan kategori", () => {
    const out = budgetSummary(
      [
        { id: "a", category: "honor", title: "Honor Surai", plannedAmount: 1_000_000, status: "aktif" },
        { id: "b", category: "sound", title: "Sound system", plannedAmount: 2_000_000, status: "aktif" },
        { id: "c", category: "honor", title: "Honor batal", plannedAmount: 500_000, status: "arsip" },
      ],
      [
        { budgetLineId: "a", amount: 1_200_000, status: "posted" },
        { budgetLineId: "b", amount: 500_000, status: "posted" },
        { budgetLineId: "b", amount: 900_000, status: "void" },
        { budgetLineId: "c", amount: 100_000, status: "posted" },
      ],
    );
    expect(out.rows.find((r) => r.id === "a")).toMatchObject({ paid: 1_200_000, remaining: 0, over: 200_000 });
    expect(out.rows.find((r) => r.id === "b")).toMatchObject({ paid: 500_000, remaining: 1_500_000, over: 0 });
    // Pos arsip: rencana tidak dihitung, uang yang sudah keluar tetap dihitung.
    expect(out.rows.find((r) => r.id === "c")).toMatchObject({ plannedAmount: 0, paid: 100_000, over: 100_000 });
    // Sisa & lebih dijumlah per pos: lebih bayar pos A/C tidak menutup sisa pos B.
    expect(out.totals).toEqual({ planned: 3_000_000, paid: 1_800_000, remaining: 1_500_000, over: 300_000 });
    expect(out.categories.map((c) => [c.category, c.planned, c.paid])).toEqual([
      ["honor", 1_000_000, 1_300_000],
      ["sound", 2_000_000, 500_000],
    ]);
  });
});

describe("budgetSummary — lebih bayar tidak menutup pos lain", () => {
  it("dua pos Rp1jt, Rp1,5jt dibayar ke pos pertama → sisa tetap Rp1jt", () => {
    const out = budgetSummary(
      [
        { id: "a", category: "sound", title: "A", plannedAmount: 1_000_000, status: "aktif" },
        { id: "b", category: "venue", title: "B", plannedAmount: 1_000_000, status: "aktif" },
      ],
      [{ budgetLineId: "a", amount: 1_500_000, status: "posted" }],
    );
    expect(out.totals).toMatchObject({ remaining: 1_000_000, over: 500_000 });
  });
});

describe("eventProfit", () => {
  it("HPP lengkap: kontribusi menu = penjualan − HPP; proyeksi memperhitungkan sponsor tertunda & sisa anggaran", () => {
    const p = eventProfit({ menuNetSales: 3_000_000, menuCost: 1_200_000, sponsorIn: 2_000_000, sponsorPending: 1_000_000, costPaid: 2_500_000, costRemaining: 1_500_000 });
    expect(p).toMatchObject({ menuContribution: 1_800_000, menuMarginKnown: true, income: 3_800_000, current: 1_300_000, projected: 800_000, status: "untung", projectedStatus: "untung" });
  });
  it("HPP tidak lengkap: penjualan dipakai apa adanya dan ditandai; rugi terdeteksi", () => {
    const p = eventProfit({ menuNetSales: 500_000, menuCost: null, sponsorIn: 0, sponsorPending: 0, costPaid: 2_000_000, costRemaining: 0 });
    expect(p).toMatchObject({ menuContribution: 500_000, menuMarginKnown: false, current: -1_500_000, status: "rugi" });
  });
});

describe("impor RAB platform GIGS", () => {
  it("kategori dari nama pos RAB asli GIGS Akhir Tahun 2026", async () => {
    const { platformBudgetCategory } = await import("@/lib/event-finance-rules");
    expect(platformBudgetCategory("Band")).toBe("honor");
    expect(platformBudgetCategory("Stand-up Comedy")).toBe("honor");
    expect(platformBudgetCategory("MC (2 orang)")).toBe("honor");
    expect(platformBudgetCategory("Sound (LIGHTING + DRUM + STAGE)")).toBe("sound");
    expect(platformBudgetCategory("Komsumsi")).toBe("konsumsi");
    expect(platformBudgetCategory("Sewa Tempat")).toBe("venue");
    expect(platformBudgetCategory("Dokumentasi")).toBe("promosi");
    expect(platformBudgetCategory("Kembang Api")).toBe("lain");
  });
  it("cadangan/tabungan bukan biaya", async () => {
    const { isReserveBudgetLine } = await import("@/lib/event-finance-rules");
    expect(isReserveBudgetLine("Save Money", "Simpanan cadangan, bukan biaya.")).toBe(true);
    expect(isReserveBudgetLine("Dana Darurat", null)).toBe(true);
    expect(isReserveBudgetLine("Band", "Honor band lokal")).toBe(false);
  });
});
