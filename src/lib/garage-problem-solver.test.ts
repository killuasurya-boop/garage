import { describe, expect, it } from "vitest";
import { buildProblemDiagnosis, investigateProblem, safeExcerpt, selectProblemProbes } from "@/lib/garage-problem-solver";

describe("AYA Smart Problem Solver V4: read-only", () => {
  it("maps QRIS discrepancy to POS and cash evidence", () => {
    const names = selectProblemProbes("Selisih QRIS kasir", "quick").map((p) => p.tool);
    expect(names).toContain("rekap_kas_harian");
    expect(names).toContain("daftar_order");
    expect(names).not.toContain("koreksi_metode_bayar");
    expect(names).not.toContain("putuskan_approval");
  });
  it("full mode is bounded and does not call write tools", () => {
    const names = selectProblemProbes("Audit seluruh sistem", "full").map((p) => p.tool);
    expect(names.length).toBeLessThanOrEqual(15);
    expect(names.some((name) => /^(ubah_|putuskan_|refund_|batalkan_|tutup_buku_)/.test(name))).toBe(false);
  });
  it("redacts PII and secrets before AI context", () => {
    const view = safeExcerpt({ token: "abc", phone: "081234567890", requester: "Kasir",
      amount: 150000, notes: "Silakan hubungi 081234567890" }) as Record<string, unknown>;
    expect(view).not.toHaveProperty("token");
    expect(view).not.toHaveProperty("phone");
    expect(view).not.toHaveProperty("requester");
    expect(view).toHaveProperty("amount", 150000);
    expect(String(view.notes)).not.toContain("081234567890");
  });
  it("does not invent a confirmed diagnosis with zero sources", () => {
    const result = buildProblemDiagnosis("Kenapa kas beda?", "quick", []);
    expect(result.analysis.verifiedFacts).toEqual([]);
    expect(result.analysis.status).toBe("DATA_UNAVAILABLE");
    expect(result.executionStatus).toBe("NOT_EXECUTED");
  });
  it("holds decision when a source is down", async () => {
    const result = await investigateProblem("stok bahan menipis", "quick", async (name) => {
      if (name === "cek_stok_bahan") throw new Error("WMS offline");
      return [];
    });
    expect(result.analysis.status).toBe("NEED_REVIEW");
    expect(result.analysis.missingEvidence.join(" ")).toContain("cek_stok_bahan");
    expect(result.ownerDecision).toBe("NOT_DECIDED");
    expect(result.proposedActions.every((a) => a.execution === "draft_only")).toBe(true);
  });
});
