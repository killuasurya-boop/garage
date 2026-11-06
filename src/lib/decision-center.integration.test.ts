import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 4: Owner Decision Center — KPI nyata, penjelasan A–J, R3 wajib 2FA, STALE, Tunda.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let dc: any;
let outletId = "";
const OWNER = "user-dc-owner";

function owner(extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: "Owner DC", email: `${OWNER}@garage.id` },
    profile: { id: "sp-dc", role: "Owner" as Role, shiftLabel: "Pagi", deviceLabel: "Tes", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}

async function order(status: string, total: number) {
  const [row] = await t.getDb().insert(t.schema.orders)
    .values({ orderNo: `POS-DC-${Math.random().toString(36).slice(2, 7)}`, outletId, channel: "Dine-in", status, subtotal: total, service: 0, tax: 0, total } as any)
    .returning();
  return row;
}
async function approval(id: string, values: Record<string, unknown>) {
  await t.getDb().insert(t.schema.approvals)
    .values({ id, type: "Tes", requester: "Kasir Rani", amount: "Rp50.000", reason: "Pelanggan komplain", risk: "medium", age: "baru", status: "pending", outletId, ...values } as any);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  dc = await import("@/lib/decision-center-server");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Owner Decision Center", () => {
  it("bukan Owner / agent key ditolak", async () => {
    await expect(dc.getDecisionOverview({ ...owner(), profile: { ...owner().profile, role: "Manajer" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(dc.getDecisionOverview(owner({ agentKey: { id: "k", label: "AI", scope: "owner" } }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("detail: penjelasan A–J dari data nyata; void order yang sudah batal → rekomendasi Tolak", async () => {
    const o = await order("voided", 80_000);
    await approval(`APP-VOID-${o.id}`, { payload: { orderId: o.id }, amountValue: 80_000 });
    const d = await dc.getDecisionDetail(owner(), `APP-VOID-${o.id}`);
    expect(d.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.explanation.problem).toMatch(/membatalkan/);
    expect(d.explanation.facts.join(" ")).toContain(o.orderNo);
    expect(d.explanation.recommendation.action).toBe("reject");
    expect(d.explanation.changes.length).toBeGreaterThan(0);
    expect(d.stepUp).toBeNull();
  });

  it("R3: tanpa kode 2FA ditolak, tanpa 2FA aktif ditolak, pengajuan tetap Menunggu", async () => {
    const o = await order("paid", 900_000);
    const id = `APP-RFD-${o.id}`;
    await approval(id, { risk: "high", payload: { orderId: o.id, refundAmount: 900_000, items: [] }, amountValue: 900_000 });
    const d = await dc.getDecisionDetail(owner(), id);
    expect(d.approval.riskTier).toBe("R3");
    expect(d.stepUp?.challengeId).toBeTruthy();
    await expect(dc.decideFromDecisionCenter(owner(), id, { action: "approve", expectedSnapshotHash: d.snapshotHash })).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    await expect(
      dc.decideFromDecisionCenter(owner(), id, { action: "approve", expectedSnapshotHash: d.snapshotHash, challengeId: d.stepUp.challengeId, nonce: d.stepUp.nonce, code: "123456" }),
    ).rejects.toMatchObject({ code: "TOTP_NOT_ENABLED" }); // Owner tanpa 2FA aktif tidak bisa memutus R3
    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.approvals).where(eq(t.schema.approvals.id, id));
    expect(row.status).toBe("pending");
  });

  it("non-R3: STALE bila data berubah; setujui dengan sidik baru → disetujui + pelaksanaan tercatat; KPI", async () => {
    const o = await order("voided", 40_000);
    const id = `APP-VOID-${o.id}`;
    await approval(id, { payload: { orderId: o.id }, amountValue: 40_000 });
    const d = await dc.getDecisionDetail(owner(), id);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.orders).set({ total: 41_000 }).where(eq(t.schema.orders.id, o.id));
    await expect(dc.decideFromDecisionCenter(owner(), id, { action: "approve", expectedSnapshotHash: d.snapshotHash })).rejects.toMatchObject({ code: "STALE" });
    const fresh = await dc.getDecisionDetail(owner(), id);
    const done = await dc.decideFromDecisionCenter(owner(), id, { action: "approve", expectedSnapshotHash: fresh.snapshotHash });
    expect(done.approval.status).toBe("approved");
    expect(done.executed).toBe(true);
    const overview = await dc.getDecisionOverview(owner());
    expect(overview.kpi.decidedToday).toBeGreaterThanOrEqual(1);
    expect(overview.kpi.highRisk).toBeGreaterThanOrEqual(1);
    expect(overview.queue[0].riskTier).toBe("R3");
  });

  it("Tunda wajib catatan; status tetap Menunggu", async () => {
    const o = await order("paid", 30_000);
    const id = `APP-VOID-${o.id}`;
    await approval(id, { payload: { orderId: o.id }, amountValue: 30_000 });
    const d = await dc.getDecisionDetail(owner(), id);
    const parked = await dc.decideFromDecisionCenter(owner(), id, { action: "defer", note: "Tunggu konfirmasi pelanggan", expectedSnapshotHash: d.snapshotHash });
    expect(parked.approval.status).toBe("pending");
    expect(parked.approval.reviewState).toBe("deferred");
  });
});
