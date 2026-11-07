import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { buildProblemDiagnosis, type SolverEvidence } from "@/lib/garage-problem-solver";
import type { ProblemSolverResult } from "@/lib/garage-problem-solver-service";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 3: kasus AYA — analisis → keputusan → tautan pelaksanaan resmi → verifikasi; linimasa append-only.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let cases: any;
let outletId = "";
const OWNER = "user-case-owner";
const OTHER_OWNER = "user-case-owner2";

function session(userId: string, role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: userId, name: `${role} Kasus`, email: `${userId}@garage.id` },
    profile: { id: `sp-${userId}`, role, shiftLabel: "Pagi", deviceLabel: "Tes", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}

function evidence(qris: number): SolverEvidence[] {
  return [
    { tool: "pengawasan_kas", domain: "shift_kas", checkedAt: new Date().toISOString(), dataAsOf: null, status: "available", recordCount: null, truncated: false,
      excerpt: {}, facts: [`QRIS beda: ${qris}`], metrics: qris ? [{ key: "qris_beda", label: "Shift dengan QRIS berbeda", value: qris, unit: "item" }] : [] },
    { tool: "daftar_order", domain: "pos", checkedAt: new Date().toISOString(), dataAsOf: null, status: "available", recordCount: 3, truncated: false,
      excerpt: {}, facts: ["3 order"], metrics: [] },
  ];
}
function result(qris: number): ProblemSolverResult {
  return { diagnosis: buildProblemDiagnosis("Selisih QRIS", "quick", evidence(qris)), ai: null, mode: "rule_based_read_only" };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values({ id: OTHER_OWNER, name: "Owner 2", email: `${OTHER_OWNER}@garage.id` });
  cases = await import("@/lib/ai-problem-cases");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Kasus AYA V4", () => {
  it("hanya Owner langsung (bukan Manajer, bukan agent key)", async () => {
    await expect(cases.createProblemCase(session(OWNER, "Manajer" as Role), { question: "x", mode: "quick", result: result(2) })).rejects.toThrow(/Owner/);
    await expect(cases.createProblemCase(session(OWNER, "Owner" as Role, { agentKey: { id: "k", label: "AI", scope: "owner" } }), { question: "x", mode: "quick", result: result(2) })).rejects.toThrow(/bukan agent/);
  });

  it("alur lengkap: analisis → keputusan (STALE dicek) → tautan operasi milik sendiri → verifikasi membaik", async () => {
    const owner = session(OWNER, "Owner" as Role);
    const row = await cases.createProblemCase(owner, { question: "Selisih QRIS shift malam", mode: "quick", result: result(2) });
    expect(row.caseNo).toMatch(/^AYA-\d{6}-[0-9A-F]{6}$/);
    expect(row.status).toBe("open");

    await expect(cases.recordCaseDecision(owner, row.id, { decision: "choose_option", optionId: "O1", expectedDiagnosisHash: "0".repeat(64) })).rejects.toMatchObject({ code: "STALE" });
    const decision = await cases.recordCaseDecision(owner, row.id, { decision: "choose_option", optionId: "O1", expectedDiagnosisHash: row.diagnosisHash });
    expect(decision.payload.execution).toBe("NOT_EXECUTED");

    // Operasi pratinjau (pending) tidak boleh ditautkan; operasi Owner lain tidak terlihat.
    const [pendingOp] = await t.getDb().insert(t.schema.mcpOperations).values({
      userId: OWNER, tool: "koreksi_metode_bayar", risk: "R3", argsDigest: "d", argsPreview: {}, nonceHash: "n", status: "pending", expiresAt: new Date(Date.now() + 60_000),
    } as any).returning();
    await expect(cases.linkCaseOperation(owner, row.id, pendingOp.id)).rejects.toMatchObject({ code: "NOT_EXECUTED" });
    const [otherOp] = await t.getDb().insert(t.schema.mcpOperations).values({
      userId: OTHER_OWNER, tool: "koreksi_metode_bayar", risk: "R3", argsDigest: "d", argsPreview: {}, nonceHash: "n2", status: "executed", expiresAt: new Date(), executedAt: new Date(),
    } as any).returning();
    await expect(cases.linkCaseOperation(owner, row.id, otherOp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [doneOp] = await t.getDb().insert(t.schema.mcpOperations).values({
      userId: OWNER, tool: "koreksi_metode_bayar", risk: "R3", argsDigest: "d", argsPreview: {}, nonceHash: "n3", status: "executed", expiresAt: new Date(), executedAt: new Date(), resultSummary: { ok: true },
    } as any).returning();
    const linked = await cases.linkCaseOperation(owner, row.id, doneOp.id);
    expect(linked.payload.outcome).toBe("succeeded");
    expect(linked.payload.resultHash).toMatch(/^[0-9a-f]{64}$/);

    const verified = await cases.verifyProblemCase(owner, row.id, result(0));
    expect(verified.verdict).toBe("improved");
    expect(verified.comparisons.find((c: any) => c.key === "qris_beda")).toMatchObject({ before: 2, after: 0, change: "better" });

    const full = await cases.getProblemCase(owner, row.id);
    expect(full.status).toBe("monitoring");
    expect(full.events.map((e: any) => e.kind)).toEqual(["analysis", "decision", "action_linked", "verification"]);
    // Owner lain tidak bisa membuka kasus ini.
    await expect(cases.getProblemCase(session(OTHER_OWNER, "Owner" as Role), row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("linimasa append-only: UPDATE ditolak database", async () => {
    const owner = session(OWNER, "Owner" as Role);
    const row = await cases.createProblemCase(owner, { question: "Stok minus", mode: "quick", result: result(1) });
    const { eq } = await import("drizzle-orm");
    await expect(
      t.getDb().update(t.schema.aiProblemCaseEvents).set({ kind: "note" }).where(eq(t.schema.aiProblemCaseEvents.caseId, row.id)),
    ).rejects.toThrow();
  });

  it("analisis ulang menaikkan versi; keputusan dengan sidik lama jadi STALE; catatan wajib untuk tutup", async () => {
    const owner = session(OWNER, "Owner" as Role);
    const row = await cases.createProblemCase(owner, { question: "Selisih QRIS", mode: "quick", result: result(2) });
    const rerun = await cases.rerunProblemCase(owner, row.id, result(3));
    expect(rerun.version).toBe(2);
    await expect(cases.recordCaseDecision(owner, row.id, { decision: "resolve", expectedDiagnosisHash: row.diagnosisHash })).rejects.toMatchObject({ code: "STALE" });
    await expect(cases.recordCaseDecision(owner, row.id, { decision: "dismiss", expectedDiagnosisHash: rerun.diagnosisHash })).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    const verified = await cases.verifyProblemCase(owner, row.id, result(5));
    expect(verified.verdict).toBe("worse");
  });
});
