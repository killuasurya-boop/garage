import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit Smart Approval Tahap C (SA-14…SA-19): bukti lintas modul & keyakinan, antrean modul lain,
// timeline mencakup peristiwa pembuatan, overview dibatasi, Tanya AYA tanpa tantangan 2FA. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let dc: any;
let outletId = "";
const OWNER = "user-intel-owner";
const KASIR = "user-intel-kasir";

const owner = (): GarageSession =>
  ({
    session: {} as any,
    user: { id: OWNER, name: "Intel Owner", email: `${OWNER}@garage.id` },
    profile: { id: "sp-intel", role: "Owner" as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;

async function approval(id: string, values: Record<string, unknown>) {
  await t.getDb().insert(t.schema.approvals).values({ id, type: "Diskon manual", requester: "Kasir Intel / Kasir", amount: "Rp40.000", reason: "Kompensasi", risk: "medium", age: "baru", status: "pending", outletId, ...values } as any);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values({ id: KASIR, name: "Kasir Intel", email: `${KASIR}@garage.id` });
  dc = await import("@/lib/decision-center-server");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Decision Center — kecerdasan berbasis bukti", () => {
  it("SA-17: riwayat pemohon & pola berulang jadi fakta/dugaan netral; keyakinan dihitung dari bukti", async () => {
    for (let i = 0; i < 3; i += 1) {
      await approval(`APP-DISC-intel-old-${i}`, { status: i === 0 ? "rejected" : "approved", amountValue: 40_000, payload: { discountAmount: 40_000, requestedBy: KASIR } });
    }
    await t.getDb().insert(t.schema.riskAlerts).values({
      ruleId: "R-TEST", ruleVersion: 1, dedupeKey: "intel-1", outletId, personUserId: KASIR, riskLevel: 2, title: "Tes", explanation: "Tes",
      eventAt: new Date(), custodyScope: "cashier", evidence: [], disposition: "OPEN",
    } as any);
    await approval("APP-DISC-intel-now", { amountValue: 40_000, payload: { discountAmount: 40_000, requestedBy: KASIR } });
    const detail = await dc.getDecisionDetail(owner(), "APP-DISC-intel-now", { stepUp: false });
    const ctx = detail.subject.context;
    expect(ctx.requesterTotal).toBe(3);
    expect(ctx.requesterApproved).toBe(2);
    expect(ctx.requesterRejected).toBe(1);
    expect(ctx.sameCategory).toBe(3);
    expect(ctx.openRiskAlerts).toBe(1);
    expect(detail.explanation.facts.join(" ")).toMatch(/1 alert risiko terbuka .*bukan kesimpulan/);
    expect(detail.explanation.facts.join(" ")).toMatch(/3 pengajuan dalam 30 hari/);
    expect(detail.explanation.hypotheses.join(" ")).toMatch(/berulang \(3×/);
    expect(["tinggi", "sedang", "rendah"]).toContain(detail.explanation.confidence.level);
    // Bahasa netral: tidak ada kata menuduh.
    expect(JSON.stringify(detail.explanation)).not.toMatch(/pelaku|curang|mencuri|offender|fraud/i);
  });

  it("SA-14: timeline memuat peristiwa pembuatan yang dicatat dengan no. order", async () => {
    const [o] = await t.getDb().insert(t.schema.orders)
      .values({ orderNo: "POS-INTEL-1", outletId, channel: "Dine-in", status: "paid", subtotal: 50_000, service: 0, tax: 0, total: 50_000 } as any)
      .returning();
    const id = `APP-VOID-${o.id}`;
    await approval(id, { type: "Void transaksi", payload: { orderId: o.id } });
    await t.getDb().insert(t.schema.auditLogs).values({ time: "10:00", actor: "Kasir Intel / Kasir", action: "Pengajuan batal order", object: "POS-INTEL-1", device: "POS", status: "approval_required", metadata: { approvalId: id } } as any);
    const detail = await dc.getDecisionDetail(owner(), id, { stepUp: false });
    expect(detail.timeline.some((e: any) => e.action === "Pengajuan batal order")).toBe(true);
  });

  it("SA-15/16: overview hanya riwayat 30 hari + antrean modul lain (baca-saja)", async () => {
    await approval("APP-DISC-intel-ancient", { status: "approved", createdAt: new Date(Date.now() - 60 * 24 * 3_600_000), amountValue: 1 });
    const overview = await dc.getDecisionOverview(owner());
    expect(overview.decided.some((r: any) => r.id === "APP-DISC-intel-ancient")).toBe(false);
    expect(overview.queue.some((r: any) => r.id === "APP-DISC-intel-now")).toBe(true);
    const keys = overview.otherQueues.map((q: any) => q.key);
    expect(keys).toEqual(expect.arrayContaining(["shift_final", "cash_out", "petty_submitted", "po", "waste", "opname"]));
    for (const q of overview.otherQueues) expect(q.count).toBeGreaterThanOrEqual(0);
  });

  it("SA-19: Tanya AYA tidak membuat tantangan 2FA (R3)", async () => {
    await approval("APP-DISC-intel-r3", { risk: "high", amountValue: 400_000, amount: "Rp400.000", payload: { discountAmount: 400_000, requestedBy: KASIR } });
    const before = (await t.getDb().select().from(t.schema.stepUpChallenges)).length;
    const res = await dc.askAyaAboutApproval(owner(), "APP-DISC-intel-r3", "Apa risikonya?");
    expect(["suggestion_only", "unavailable"]).toContain(res.status);
    expect((await t.getDb().select().from(t.schema.stepUpChallenges)).length).toBe(before);
  });
});
