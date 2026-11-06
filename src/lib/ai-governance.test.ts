import { describe, expect, it } from "vitest";

import { aiModeOf, settingsForMode, summarizeCases, summarizeDecisionQuality, summarizeOperations, summarizeTools } from "@/lib/ai-governance";

describe("AI Governance (Batch 7)", () => {
  it("mode dari dua saklar; Dijeda menang; mode → saklar bolak-balik konsisten", () => {
    expect(aiModeOf({ paused: true, writeEnabled: true })).toBe("paused");
    expect(aiModeOf({ paused: false, writeEnabled: false })).toBe("read_only");
    expect(aiModeOf({ paused: false, writeEnabled: true })).toBe("controlled");
    for (const mode of ["paused", "read_only", "controlled"] as const) {
      const s = settingsForMode(mode);
      expect(aiModeOf({ paused: s.mcpChatgptPaused, writeEnabled: s.mcpChatgptWriteEnabled })).toBe(mode);
    }
    // Membuka jeda tidak langsung membuka tulis.
    expect(settingsForMode("paused").mcpChatgptWriteEnabled).toBe(false);
  });

  it("operasi: confirmed tanpa hasil = tidak pasti, pending lewat masa = kedaluwarsa", () => {
    const now = Date.parse("2026-11-06T10:00:00Z");
    const at = (iso: string) => new Date(iso);
    const s = summarizeOperations(
      [
        { status: "executed", risk: "R2", source: "chatgpt", expiresAt: at("2026-11-06T09:05:00Z"), createdAt: at("2026-11-06T09:00:00Z") },
        { status: "failed", risk: "R3", source: "chatgpt", expiresAt: at("2026-11-06T09:05:00Z"), createdAt: at("2026-11-06T09:00:00Z") },
        { status: "confirmed", risk: "R2", source: "garage_owner_ui", expiresAt: at("2026-11-06T09:05:00Z"), createdAt: at("2026-11-06T09:00:00Z") },
        { status: "pending", risk: "R2", source: "chatgpt", expiresAt: at("2026-11-06T09:05:00Z"), createdAt: at("2026-11-06T09:00:00Z") },
        { status: "pending", risk: "R2", source: "chatgpt", expiresAt: at("2026-11-06T10:04:00Z"), createdAt: at("2026-11-06T09:59:00Z") },
      ],
      now,
    );
    expect(s).toMatchObject({ total: 5, executed: 1, failed: 1, uncertain: 1, expired: 1, waiting: 1 });
    expect(s.byRisk).toEqual({ R2: 4, R3: 1 });
  });

  it("efektivitas = membaik ÷ yang sudah diverifikasi (bukan ÷ semua kasus)", () => {
    const s = summarizeCases([
      { id: "a", status: "resolved", latestVerdict: "improved" },
      { id: "b", status: "monitoring", latestVerdict: "worse" },
      { id: "c", status: "open", latestVerdict: null },
      { id: "d", status: "open", latestVerdict: null },
    ]);
    expect(s.verified).toBe(2);
    expect(s.effectivenessPct).toBe(50);
    expect(s.status).toMatchObject({ open: 2, monitoring: 1, resolved: 1 });
    expect(summarizeCases([{ id: "x", status: "open", latestVerdict: null }]).effectivenessPct).toBeNull();
  });

  it("ringkasan tool per risiko & 16 domain", () => {
    const s = summarizeTools([
      { name: "a", title: "A", domain: "pos", risk: "R0", write: false },
      { name: "b", title: "B", domain: "pos", risk: "R3", write: true },
      { name: "c", title: "C", domain: "keuangan", risk: "R2", write: true },
    ]);
    expect(s.total).toBe(3);
    expect(s.domains).toHaveLength(16);
    expect(s.byRisk.find((r) => r.risk === "R3")?.count).toBe(1);
    expect(s.domains.find((d) => d.id === "pos")?.tools[0].name).toBe("b");
  });

  it("Tahap D: kualitas keputusan dari data nyata (kesesuaian hanya dari yang tercatat)", () => {
    const q = summarizeDecisionQuality([
      { status: "approved", decidedVia: "decision_center", executionStatus: "succeeded", payload: { decisionCenter: { followed: true, confidence: "tinggi" } } },
      { status: "rejected", decidedVia: "decision_center", executionStatus: "not_required", payload: { decisionCenter: { followed: false, confidence: "sedang" } } },
      { status: "approved", decidedVia: "board", executionStatus: "uncertain", payload: {} },
      { status: "expired", decidedVia: "auto", executionStatus: "not_required", payload: {} },
      { status: "superseded", decidedVia: "auto", executionStatus: "not_required", payload: null },
    ]);
    expect(q.recommendation).toMatchObject({ recorded: 2, followed: 1, followedPct: 50 });
    expect(q.recommendation.byConfidence.tinggi).toEqual({ total: 1, followed: 1 });
    expect(q.execution).toMatchObject({ attempted: 2, succeeded: 1, successPct: 50 });
    expect(q).toMatchObject({ expired: 1, superseded: 1, uncertain: 1 });
    expect(q.byChannel).toMatchObject({ decision_center: 2, board: 1, auto: 2 });
    expect(summarizeDecisionQuality([]).recommendation.followedPct).toBeNull();
  });
});
