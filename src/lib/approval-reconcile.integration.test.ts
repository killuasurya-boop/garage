import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { notificationFor, supersedeReason, verifyStuckExecution } from "@/lib/approval-reconcile-rules";
import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { approvalExpiresAt } from "@/lib/smart-approval";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit Smart Approval Tahap B (SA-04…SA-11): kedaluwarsa, digantikan, pelaksanaan macet, push Owner,
// sweep menghormati Ditunda, error tanpa SQL, opname lama, ProfitMax lengkap. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let rec: any;
let outletId = "";
const OWNER = "user-rec-owner";
const MANAJER = "user-rec-manajer";
const KASIR = "user-rec-kasir";

function session(id: string, role: string): GarageSession {
  return {
    session: {} as any,
    user: { id, name: `Rec ${role}`, email: `${id}@garage.id` },
    profile: { id: `sp-${id}`, role: role as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
async function row(id: string) {
  const { eq } = await import("drizzle-orm");
  const [r] = await t.getDb().select().from(t.schema.approvals).where(eq(t.schema.approvals.id, id));
  return r;
}
async function approval(id: string, values: Record<string, unknown>) {
  await t.getDb().insert(t.schema.approvals).values({ id, type: "Tes", requester: "Kasir", amount: "Rp50.000", reason: "tes", risk: "medium", age: "baru", status: "pending", outletId, ...values } as any);
}
async function order(status: string, total = 50_000) {
  const [o] = await t.getDb().insert(t.schema.orders)
    .values({ orderNo: `POS-REC-${Math.random().toString(36).slice(2, 8)}`, outletId, channel: "Dine-in", status, subtotal: total, service: 0, tax: 0, total } as any)
    .returning();
  return o;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: MANAJER, name: "Rec Manajer", email: `${MANAJER}@garage.id` },
    { id: KASIR, name: "Rec Kasir", email: `${KASIR}@garage.id` },
  ]);
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any).onConflictDoNothing();
  svc = await import("@/lib/garage-service");
  rec = await import("@/lib/approval-reconcile");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("aturan murni", () => {
  it("digantikan hanya bila objek sumber benar-benar berubah; macet = berhasil hanya dengan bukti", () => {
    expect(supersedeReason("APP-VOID-x", { orderStatus: "paid" })).toBeNull();
    expect(supersedeReason("APP-VOID-x", { orderStatus: "voided" })).toMatch(/dibatalkan/);
    expect(supersedeReason("APP-RFD-x", { orderStatus: "voided" })).toMatch(/tidak lagi berstatus lunas/);
    expect(supersedeReason("APP-OPN-x", {})).toMatch(/Stok Opname/);
    expect(supersedeReason("APP-EXP-x", { expenseStatus: "approved" })).toBeNull();
    expect(verifyStuckExecution("APP-VOID-x", "approved", { orderStatus: "voided" })).toBe("succeeded");
    expect(verifyStuckExecution("APP-VOID-x", "approved", { orderStatus: "paid" })).toBe("uncertain");
    expect(verifyStuckExecution("APP-RFD-x", "approved", { orderStatus: "paid" })).toBe("uncertain");
  });

  it("push: R3 segera, R2 setelah 30 menit, yang ditunda tidak", () => {
    const now = Date.parse("2026-11-06T10:00:00Z");
    const at = (min: number) => new Date(now - min * 60_000);
    expect(notificationFor({ id: "a", tier: "R3", createdAt: at(0), reviewState: null }, now, 30)?.kind).toBe("approval_r3");
    expect(notificationFor({ id: "b", tier: "R2", createdAt: at(10), reviewState: null }, now, 30)).toBeNull();
    expect(notificationFor({ id: "c", tier: "R2", createdAt: at(31), reviewState: null }, now, 30)?.kind).toBe("approval_escalation");
    expect(notificationFor({ id: "d", tier: "R3", createdAt: at(0), reviewState: "deferred" }, now, 30)).toBeNull();
    expect(approvalExpiresAt("APP-DISC-1", new Date(now))?.toISOString()).toBe("2026-11-06T16:00:00.000Z");
    expect(approvalExpiresAt("APP-VOID-1", new Date(now))).toBeNull();
  });
});

describe("rekonsiliasi (DB)", () => {
  it("kedaluwarsa & digantikan ditandai, tidak dihapus; keputusan atas yang kedaluwarsa ditolak", async () => {
    await approval("APP-DISC-rec-old", { type: "Diskon manual", expiresAt: new Date(Date.now() - 60_000), payload: { discountAmount: 50_000, requestedBy: KASIR } });
    await approval("APP-DISC-rec-live", { type: "Diskon manual", expiresAt: new Date(Date.now() + 3_600_000), payload: { discountAmount: 50_000, requestedBy: KASIR } });
    await expect(svc.decideApproval("APP-DISC-rec-old", { status: "approved" }, session(MANAJER, "Manajer"))).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
    const voided = await order("voided");
    await approval(`APP-VOID-${voided.id}`, { payload: { orderId: voided.id } });
    const paid = await order("paid");
    await approval(`APP-VOID-${paid.id}`, { payload: { orderId: paid.id } });
    await approval("APP-OPN-rec-legacy", { type: "Stock adjustment", amount: "+3" });

    const result = await rec.reconcileApprovals();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await row("APP-DISC-rec-old")).status).toBe("expired");
    expect((await row("APP-DISC-rec-live")).status).toBe("pending");
    expect((await row(`APP-VOID-${voided.id}`)).status).toBe("superseded");
    expect((await row(`APP-VOID-${paid.id}`)).status).toBe("pending");
    expect((await row("APP-OPN-rec-legacy")).status).toBe("superseded");
    const audits = await t.getDb().select().from(t.schema.auditLogs);
    expect(audits.some((a: any) => a.action === "Pengajuan digantikan" && a.object === "APP-OPN-rec-legacy")).toBe(true);
  });

  it("pelaksanaan macet: terbukti dari sumber → berhasil; tidak terbukti → tidak pasti", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const done = await order("voided");
    const notDone = await order("paid");
    await approval(`APP-VOID-${done.id}`, { status: "approved", decidedAt: old, executionStatus: "running", payload: { orderId: done.id } });
    await approval(`APP-VOID-${notDone.id}`, { status: "approved", decidedAt: old, executionStatus: "running", payload: { orderId: notDone.id } });
    const fresh = await order("paid");
    await approval(`APP-VOID-${fresh.id}`, { status: "approved", decidedAt: new Date(), executionStatus: "running", payload: { orderId: fresh.id } });
    await rec.reconcileApprovals();
    expect((await row(`APP-VOID-${done.id}`)).executionStatus).toBe("succeeded");
    expect((await row(`APP-VOID-${notDone.id}`)).executionStatus).toBe("uncertain");
    expect((await row(`APP-VOID-${fresh.id}`)).executionStatus).toBe("running");
  });

  it("push R3 ke Owner sekali saja (dedup), tanpa nama pemohon", async () => {
    const big = await order("paid", 900_000);
    await approval(`APP-VOID-${big.id}`, { risk: "high", amountValue: 900_000, amount: "Rp900.000", requester: "Kasir Rahasia", payload: { orderId: big.id } });
    const first = await rec.reconcileApprovals();
    const second = await rec.reconcileApprovals();
    expect(first.notified).toBeGreaterThanOrEqual(1);
    expect(second.notified).toBe(0);
    const notes = await t.getDb().select().from(t.schema.staffNotifications);
    const mine = notes.filter((n: any) => n.kind === "approval_r3" && n.userId === OWNER);
    expect(mine.length).toBe(1);
    expect(JSON.stringify(mine[0])).not.toContain("Kasir Rahasia");
  });
});

describe("perbaikan lain Tahap B", () => {
  it("SA-04: sweep tidak menyentuh pengajuan yang Ditunda; SA-11 alasan tanpa SQL", async () => {
    await approval("APP-EXP-rec-deferred", { amountValue: 50_000, payload: { requestedBy: KASIR }, reviewState: "deferred", reviewNote: "tunggu nota" });
    await approval("APP-EXP-rec-badid", { amountValue: 50_000, payload: { requestedBy: KASIR } });
    const res = await svc.runAutoApprovalSweep(session(MANAJER, "Manajer"));
    const deferred = res.decisions.find((d: any) => d.id === "APP-EXP-rec-deferred");
    expect(deferred.decision).toBe("skipped");
    expect(deferred.reason).toMatch(/ditunda/);
    expect((await row("APP-EXP-rec-deferred")).executionAttempts).toBe(0);
    for (const d of res.decisions) expect(String(d.reason)).not.toMatch(/Failed query|select .* from/i);
  });

  it("SA-07: opname lama tidak bisa disetujui (tidak pernah 'berhasil')", async () => {
    await approval("APP-OPN-rec-approve", { type: "Stock adjustment", amount: "+3" });
    await expect(svc.decideApproval("APP-OPN-rec-approve", { status: "approved" }, session(OWNER, "Owner"))).rejects.toThrow(/Stok Opname/);
    const r = await row("APP-OPN-rec-approve");
    expect(r.status).toBe("pending");
    expect(r.executionStatus).toBe("failed");
  });

  it("SA-08: pengajuan ProfitMax lengkap (outlet, nominal, pemohon)", async () => {
    const pm = await import("@/lib/profitmax-service");
    const created = await pm.createProfitMaxApproval(
      { actionType: "price_change", title: "Naikkan harga latte", amount: "Rp2.000", reason: "Margin di bawah target", risk: "low" },
      session(MANAJER, "Manajer"),
    );
    const r = await row(created.id);
    expect(r.outletId).toBe(outletId);
    expect(r.amountValue).toBe(2000);
    expect((r.payload as any).requestedBy).toBe(MANAJER);
  });
});
