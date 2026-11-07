import { describe, expect, it } from "vitest";

import {
  AUTO_APPROVAL_DAILY_LIMIT_PER_REQUESTER,
  approvalRiskTier,
  autoApprovalDecision,
  bulkDecisionBlockReason,
  canDecideForOutlet,
  parseRupiahLabel,
} from "@/lib/smart-approval";

const row = (id: string, risk: string, amountValue: number | null = 100_000) => ({ id, type: "x", risk, amountValue });
const ctx = { threshold: 1_000_000, sweeperUserId: "manajer", autoApprovedTodayForRequester: 0 };

describe("Smart Approval V3 — aturan murni", () => {
  it("tier R3 = risiko tinggi + uang/stok; R2 = uang; R1 = lainnya rendah", () => {
    expect(approvalRiskTier(row("APP-RFD-1", "high"))).toBe("R3");
    expect(approvalRiskTier(row("APP-CASH-1", "high"))).toBe("R3");
    expect(approvalRiskTier(row("APP-OPN-1", "high"))).toBe("R3");
    expect(approvalRiskTier(row("APP-EXP-1", "medium"))).toBe("R2");
    expect(approvalRiskTier(row("PMX-1", "low"))).toBe("R1");
  });

  it("setuju massal ditolak untuk R3 dan pengajuan yang menggerakkan uang laci/stok; tolak massal boleh", () => {
    expect(bulkDecisionBlockReason(row("APP-RFD-1", "high"), "approved")).toMatch(/R3/);
    expect(bulkDecisionBlockReason(row("APP-VOID-1", "medium"), "approved")).toMatch(/satu per satu/);
    expect(bulkDecisionBlockReason(row("APP-CASH-1", "medium"), "approved")).toMatch(/satu per satu/);
    expect(bulkDecisionBlockReason(row("APP-OPN-1", "medium"), "approved")).toMatch(/satu per satu/);
    expect(bulkDecisionBlockReason(row("APP-EXP-1", "medium"), "approved")).toBeNull();
    expect(bulkDecisionBlockReason(row("APP-RFD-1", "high"), "rejected")).toBeNull();
  });

  it("auto-approval: hanya pengeluaran risiko rendah/sedang di bawah batas, pemohon tercatat & bukan diri sendiri, batas harian", () => {
    const expense = { ...row("APP-EXP-1", "medium", 200_000), requestedBy: "kasir" };
    expect(autoApprovalDecision(expense, ctx).approve).toBe(true);
    expect(autoApprovalDecision({ ...expense, risk: "high" }, ctx).approve).toBe(false);
    expect(autoApprovalDecision({ ...expense, amountValue: 1_000_000 }, ctx).approve).toBe(false);
    expect(autoApprovalDecision({ ...expense, amountValue: null }, ctx).approve).toBe(false);
    expect(autoApprovalDecision({ ...expense, requestedBy: null }, ctx).approve).toBe(false);
    expect(autoApprovalDecision({ ...expense, requestedBy: "manajer" }, ctx).approve).toBe(false);
    expect(autoApprovalDecision(expense, { ...ctx, autoApprovedTodayForRequester: AUTO_APPROVAL_DAILY_LIMIT_PER_REQUESTER }).approve).toBe(false);
    expect(autoApprovalDecision({ ...row("APP-RFD-1", "low"), requestedBy: "kasir" }, ctx).approve).toBe(false);
  });

  it("outlet: Owner semua, Manajer hanya outletnya, pengajuan lama tanpa outlet terbuka", () => {
    expect(canDecideForOutlet("Owner", "a", "b")).toBe(true);
    expect(canDecideForOutlet("Manajer", "a", "a")).toBe(true);
    expect(canDecideForOutlet("Manajer", "a", "b")).toBe(false);
    expect(canDecideForOutlet("Manajer", "a", null)).toBe(true);
    expect(canDecideForOutlet("Manajer", null, "b")).toBe(false);
  });

  it("label rupiah dibaca angka; label stok bukan rupiah", () => {
    expect(parseRupiahLabel("Rp1.234.567")).toBe(1_234_567);
    expect(parseRupiahLabel("Rp 50.000")).toBe(50_000);
    expect(parseRupiahLabel("+10")).toBeNull();
  });

  it("diskon: R3 dari nominal (≥ Rp100.000), bukan persentase", () => {
    const disc = (risk: string, amountValue: number | null) => approvalRiskTier({ id: "APP-DISC-1", type: "Diskon manual", risk, amountValue });
    expect(disc("high", 10_000)).toBe("R2");
    expect(disc("high", 150_000)).toBe("R3");
    expect(disc("high", null)).toBe("R3");
    expect(approvalRiskTier({ id: "APP-VOID-1", type: "Void", risk: "high", amountValue: 10_000 })).toBe("R3");
  });
});
