import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 7c: PDF lembar keputusan — Owner saja, tanpa membuat tantangan 2FA, DRAFT sampai
// diputus & pelaksanaan tercatat. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let dc: any;
let pdf: any;
let svc: any;
let outletId = "";
const OWNER = "user-dpdf-owner";

function session(role: string, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: "Owner PDF", email: `${OWNER}@garage.id` },
    profile: { id: "sp-dpdf", role: role as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  dc = await import("@/lib/decision-center-server");
  pdf = await import("@/lib/decision-pdf");
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("PDF keputusan", () => {
  it("R3 menunggu: PDF dibuat tanpa tantangan 2FA; DRAFT; Owner saja", async () => {
    await t.getDb().insert(t.schema.approvals).values({
      id: "APP-DISC-pdf-1", type: "Diskon manual", requester: "Kasir Rani", amount: "Rp400.000", reason: "Kompensasi", risk: "high",
      age: "baru", status: "pending", outletId, amountValue: 400_000, payload: { discountAmount: 400_000 },
    } as any);
    const before = await t.getDb().select().from(t.schema.stepUpChallenges);
    const detail = await dc.getDecisionDetail(session("Owner"), "APP-DISC-pdf-1", { stepUp: false });
    expect(detail.stepUp).toBeNull();
    expect(await t.getDb().select().from(t.schema.stepUpChallenges)).toHaveLength(before.length);
    expect(pdf.decisionPdfIsFinal(detail.approval)).toBe(false);
    const buffer: Buffer = await pdf.renderDecisionPdf(detail);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(2000);
    expect(pdf.decisionPdfFileName(detail.approval, detail.checkedAt)).toMatch(/^GarageOS_Keputusan_APP-DISC-pdf-1_\d{4}-\d{2}-\d{2}\.pdf$/);
    await expect(dc.getDecisionDetail(session("Manajer"), "APP-DISC-pdf-1", { stepUp: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("final hanya bila diputus dan pelaksanaan tidak gagal/menggantung", async () => {
    expect(pdf.decisionPdfIsFinal({ status: "approved", executionStatus: "succeeded" })).toBe(true);
    expect(pdf.decisionPdfIsFinal({ status: "approved", executionStatus: "failed" })).toBe(false);
    expect(pdf.decisionPdfIsFinal({ status: "approved", executionStatus: "running" })).toBe(false);
    expect(pdf.decisionPdfIsFinal({ status: "rejected", executionStatus: "not_required" })).toBe(true);
    await svc.decideApproval("APP-DISC-pdf-1", { status: "rejected", reasonDecided: "terlalu besar" }, session("Owner"));
    const detail = await dc.getDecisionDetail(session("Owner"), "APP-DISC-pdf-1", { stepUp: false });
    expect(pdf.decisionPdfIsFinal(detail.approval)).toBe(true);
    expect((await pdf.renderDecisionPdf(detail)).subarray(0, 4).toString()).toBe("%PDF");
  });
});
