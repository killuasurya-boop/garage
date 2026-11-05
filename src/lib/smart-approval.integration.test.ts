import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Smart Approval V3 (Batch 1): keputusan ≠ pelaksanaan, STALE, bulk/auto gate, outlet scope,
// keputusan bersamaan, Tunda/Minta revisi. DB uji PGlite, bukan produksi.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletA = "";
let outletB = "";
const MANAJER = "user-sa-manajer";
const OWNER = "user-sa-owner";
const KASIR = "user-sa-kasir";

function session(userId: string, role: Role, outletId: string): GarageSession {
  return {
    user: { id: userId, name: `${role} SA`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Tes",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const manajerA = () => session(MANAJER, "Manajer" as Role, outletA);
const owner = () => session(OWNER, "Owner" as Role, outletA);

async function q() {
  return import("drizzle-orm");
}
async function approvalRow(id: string) {
  const { eq } = await q();
  const [row] = await t.getDb().select().from(t.schema.approvals).where(eq(t.schema.approvals.id, id));
  return row;
}
async function insertOrder(status: string, total = 50_000, outletId = outletA) {
  const [order] = await t
    .getDb()
    .insert(t.schema.orders)
    .values({ orderNo: `POS-SA-${Math.random().toString(36).slice(2, 8)}`, outletId, channel: "Dine-in", status, subtotal: total, service: 0, tax: 0, total } as any)
    .returning();
  return order;
}
async function insertApproval(id: string, values: Record<string, unknown>) {
  await t
    .getDb()
    .insert(t.schema.approvals)
    .values({ id, type: "Tes", requester: "Kasir", amount: "Rp50.000", reason: "tes", risk: "medium", age: "baru", status: "pending", ...values } as any);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletA = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  const [other] = await t.getDb().insert(t.schema.outlets).values({ code: "TSB", name: "Outlet B" }).returning();
  outletB = other.id;
  await t.getDb().insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer SA", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner SA", email: `${OWNER}@garage.id` },
  ]);
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Smart Approval V3 — keputusan ≠ pelaksanaan", () => {
  it("berhasil: status approved + execution succeeded + sidik tersimpan", async () => {
    const order = await insertOrder("voided");
    await insertApproval(`APP-VOID-${order.id}`, { payload: { orderId: order.id }, outletId: outletA });
    const result = await svc.decideApproval(`APP-VOID-${order.id}`, { status: "approved" }, manajerA());
    expect(result.status).toBe("approved");
    const row = await approvalRow(`APP-VOID-${order.id}`);
    expect(row.executionStatus).toBe("succeeded");
    expect(row.executedAt).toBeTruthy();
    expect(row.decisionSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gagal dijalankan: kembali Menunggu, execution failed + alasan + audit, bisa diputus ulang", async () => {
    const order = await insertOrder("voided");
    const id = `APP-RFD-${order.id}`;
    await insertApproval(id, { payload: { orderId: order.id, items: [], refundAmount: 50_000 }, outletId: outletA });
    await expect(svc.decideApproval(id, { status: "approved" }, manajerA())).rejects.toThrow();
    const row = await approvalRow(id);
    expect(row.status).toBe("pending");
    expect(row.executionStatus).toBe("failed");
    expect(row.executionError).toBeTruthy();
    expect(row.executionAttempts).toBe(1);
    const { eq } = await q();
    const audits = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.object, id));
    expect(audits.some((audit: any) => audit.action === "Pelaksanaan keputusan gagal")).toBe(true);
    // Ditolak tetap bisa (tanpa efek uang).
    const rejected = await svc.decideApproval(id, { status: "rejected", reasonDecided: "Order sudah batal" }, manajerA());
    expect(rejected.status).toBe("rejected");
    expect((await approvalRow(id)).executionStatus).toBe("not_required");
  });

  it("STALE: data order berubah sejak preview → keputusan ditolak", async () => {
    const order = await insertOrder("voided");
    const id = `APP-VOID-${order.id}`;
    await insertApproval(id, { payload: { orderId: order.id }, outletId: outletA });
    const hash = await svc.getApprovalSnapshotHash(id);
    const { eq } = await q();
    await t.getDb().update(t.schema.orders).set({ total: 99_000 }).where(eq(t.schema.orders.id, order.id));
    await expect(svc.decideApproval(id, { status: "approved" }, owner(), { expectedSnapshotHash: hash })).rejects.toBeInstanceOf(svc.ApprovalStaleError);
    expect((await approvalRow(id)).status).toBe("pending");
    const fresh = await svc.getApprovalSnapshotHash(id);
    const ok = await svc.decideApproval(id, { status: "approved" }, owner(), { expectedSnapshotHash: fresh });
    expect(ok.status).toBe("approved");
  });

  it("keputusan bersamaan: hanya satu yang lolos", async () => {
    const order = await insertOrder("voided");
    const id = `APP-VOID-${order.id}`;
    await insertApproval(id, { payload: { orderId: order.id }, outletId: outletA });
    const results = await Promise.allSettled([
      svc.decideApproval(id, { status: "approved" }, manajerA()),
      svc.decideApproval(id, { status: "approved" }, owner()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await approvalRow(id)).executionAttempts).toBe(1);
  });
});

describe("Smart Approval V3 — outlet, bulk, auto, tunda", () => {
  it("Manajer outlet A tidak bisa memutus pengajuan outlet B; Owner bisa; daftar Manajer tersaring", async () => {
    const order = await insertOrder("voided", 20_000, outletB);
    const id = `APP-VOID-${order.id}`;
    await insertApproval(id, { payload: { orderId: order.id }, outletId: outletB });
    await expect(svc.decideApproval(id, { status: "approved" }, manajerA())).rejects.toThrow(/outlet lain/);
    const list = await svc.getApprovalData({ status: "pending", viewer: manajerA() });
    expect(list.some((row: any) => row.id === id)).toBe(false);
    const ownerList = await svc.getApprovalData({ status: "pending", viewer: owner() });
    expect(ownerList.some((row: any) => row.id === id)).toBe(true);
    expect((await svc.decideApproval(id, { status: "approved" }, owner())).status).toBe("approved");
  });

  it("bulk setuju menolak R3/void/refund di server, tolak massal tetap jalan", async () => {
    const order = await insertOrder("voided");
    await insertApproval("APP-RFD-bulk-high", { risk: "high", payload: { orderId: order.id }, outletId: outletA });
    await insertApproval(`APP-VOID-${order.id}`, { payload: { orderId: order.id }, outletId: outletA });
    const result = await svc.decideApprovalsBulk(["APP-RFD-bulk-high", `APP-VOID-${order.id}`], { status: "approved" }, owner());
    expect(result.succeeded).toBe(0);
    expect(result.results.map((r: any) => r.error)).toEqual([expect.stringMatching(/R3/), expect.stringMatching(/satu per satu/)]);
    expect((await approvalRow("APP-RFD-bulk-high")).status).toBe("pending");
    const rejected = await svc.decideApprovalsBulk(["APP-RFD-bulk-high"], { status: "rejected", reasonDecided: "Tidak sesuai bukti" }, owner());
    expect(rejected.succeeded).toBe(1);
  });

  it("auto-sweep: lewati risiko tinggi, tanpa pemohon, pengajuan sendiri, outlet lain", async () => {
    await insertApproval("APP-EXP-auto-high", { risk: "high", amountValue: 50_000, payload: { requestedBy: KASIR }, outletId: outletA });
    await insertApproval("APP-EXP-auto-nobody", { amountValue: 50_000, payload: {}, outletId: outletA });
    await insertApproval("APP-EXP-auto-self", { amountValue: 50_000, payload: { requestedBy: MANAJER }, outletId: outletA });
    await insertApproval("APP-EXP-auto-other", { amountValue: 50_000, payload: { requestedBy: KASIR }, outletId: outletB });
    const result = await svc.runAutoApprovalSweep(manajerA());
    const byId = new Map(result.decisions.map((d: any) => [d.id, d]));
    for (const id of ["APP-EXP-auto-high", "APP-EXP-auto-nobody", "APP-EXP-auto-self", "APP-EXP-auto-other"]) {
      expect((byId.get(id) as any)?.decision).toBe("skipped");
      expect((await approvalRow(id)).status).toBe("pending");
    }
  });

  it("Tunda / Minta revisi: catatan wajib, status tetap pending, tercatat", async () => {
    const order = await insertOrder("paid");
    const id = `APP-VOID-${order.id}`;
    await insertApproval(id, { payload: { orderId: order.id }, outletId: outletA });
    await expect(svc.reviewApproval(id, { action: "defer" }, manajerA())).rejects.toThrow(/Catatan/);
    const deferred = await svc.reviewApproval(id, { action: "request_revision", note: "Lampirkan foto struk" }, manajerA());
    expect(deferred.status).toBe("pending");
    expect(deferred.reviewState).toBe("revision_requested");
    const cleared = await svc.reviewApproval(id, { action: "clear" }, owner());
    expect(cleared.reviewState).toBeNull();
    const fetched = await svc.getApprovalById(id);
    expect(fetched.riskTier).toBe("R2");
    expect(fetched.executionStatus).toBe("not_required");
  });
});
