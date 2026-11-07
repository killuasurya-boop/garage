import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { decisionPolicyBlock } from "@/lib/smart-approval";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit Smart Approval Tahap A (SA-01/SA-02/SA-03): satu kebijakan keputusan untuk semua jalur.
// Probe audit yang dulu LOLOS kini harus DITOLAK. DB uji PGlite, bukan produksi.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let keys: any;
let tools: any;
let outletId = "";
const OWNER = "user-pol-owner";
const MANAJER = "user-pol-manajer";
const MANAJER2 = "user-pol-manajer2";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function session(id: string, role: string): GarageSession {
  return {
    session: {} as any,
    user: { id, name: `Pol ${role} ${id.slice(-2)}`, email: `${id}@garage.id` },
    profile: { id: `sp-${id}`, role: role as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
const owner = () => session(OWNER, "Owner");
const manajer = () => session(MANAJER, "Manajer");
async function row(id: string) {
  const { eq } = await import("drizzle-orm");
  const [r] = await t.getDb().select().from(t.schema.approvals).where(eq(t.schema.approvals.id, id));
  return r;
}
async function approval(id: string, values: Record<string, unknown>) {
  await t.getDb().insert(t.schema.approvals).values({ id, type: "Tes", requester: "Kasir", amount: "Rp50.000", reason: "tes", risk: "medium", age: "baru", status: "pending", outletId, ...values } as any);
}
async function order(status: string, total: number) {
  const [o] = await t.getDb().insert(t.schema.orders)
    .values({ orderNo: `POS-POL-${Math.random().toString(36).slice(2, 8)}`, outletId, channel: "Dine-in", status, subtotal: total, service: 0, tax: 0, total } as any)
    .returning();
  return o;
}
async function r3Void() {
  const o = await order("voided", 900_000);
  const id = `APP-VOID-${o.id}`;
  await approval(id, { risk: "high", amountValue: 900_000, payload: { orderId: o.id } });
  return id;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: MANAJER, name: "Pol Manajer", email: `${MANAJER}@garage.id` },
    { id: MANAJER2, name: "Pol Manajer Dua", email: `${MANAJER2}@garage.id` },
  ]);
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any).onConflictDoNothing();
  svc = await import("@/lib/garage-service");
  keys = await import("@/lib/agent-api-key");
  tools = await import("@/lib/agent-tools");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("kebijakan pusat (murni)", () => {
  const base = { status: "approved" as const, agentKey: false, stepUpVerified: false };
  it("agent key tidak pernah memutus; menolak R3 selalu boleh; R3 setuju = Owner + 2FA", () => {
    expect(decisionPolicyBlock({ ...base, tier: "R1", role: "Owner", channel: "board", agentKey: true })?.code).toBe("AGENT_CANNOT_DECIDE");
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Manajer", channel: "board", status: "rejected" })).toBeNull();
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Manajer", channel: "decision_center", stepUpVerified: true })?.code).toBe("R3_OWNER_ONLY");
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Owner", channel: "board" })?.code).toBe("R3_STEP_UP_REQUIRED");
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Owner", channel: "pin", stepUpVerified: true })?.code).toBe("R3_STEP_UP_REQUIRED");
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Owner", channel: "decision_center", stepUpVerified: true })).toBeNull();
    expect(decisionPolicyBlock({ ...base, tier: "R3", role: "Owner", channel: "langsung" })).toBeNull();
    expect(decisionPolicyBlock({ ...base, tier: "R2", role: "Manajer", channel: "pin" })).toBeNull();
  });
});

describe("semua jalur (dulu lolos di audit, kini ditolak)", () => {
  it("SA-02: API key agent tidak bisa memutus lewat putuskan_approval maupun decideApproval", async () => {
    const { key } = await keys.createAgentKey({ label: "Pol Bot", scope: "owner", expiresInDays: 30 }, owner());
    const agent = (await keys.resolveAgentSession(key, new Headers({ authorization: `Bearer ${key}`, "x-garage-agent-method": "POST", "x-garage-agent-path": "/api/agent/v1/tools/putuskan_approval" }))).data;
    const id = await r3Void();
    await expect(tools.runAgentTool(agent, "putuskan_approval", { id, keputusan: "approved" }, ctx)).rejects.toMatchObject({ code: "AGENT_CANNOT_DECIDE" });
    await expect(tools.runAgentTool(agent, "putuskan_approval", { id, keputusan: "rejected", alasan: "tes tolak" }, ctx)).rejects.toMatchObject({ code: "AGENT_CANNOT_DECIDE" });
    await expect(svc.reviewApproval(id, { action: "defer", note: "nanti dulu" }, agent)).rejects.toMatchObject({ code: "AGENT_CANNOT_DECIDE" });
    expect((await row(id)).status).toBe("pending");
  });

  it("SA-01: Manajer tidak bisa menyetujui R3 dari papan/PIN; Owner pun wajib 2FA; menolak tetap boleh", async () => {
    const id = await r3Void();
    await expect(svc.decideApproval(id, { status: "approved" }, manajer())).rejects.toMatchObject({ code: "R3_OWNER_ONLY" });
    await expect(svc.decideApproval(id, { status: "approved" }, owner())).rejects.toMatchObject({ code: "R3_STEP_UP_REQUIRED" });
    await expect(svc.decideApproval(id, { status: "approved" }, owner(), { via: "pin" })).rejects.toMatchObject({ code: "R3_STEP_UP_REQUIRED" });
    // Bendera stepUpVerified dari kanal yang tidak memverifikasi kode tidak berlaku (hanya kode server yang mengisinya).
    expect((await row(id)).status).toBe("pending");
    const rejected = await svc.decideApproval(id, { status: "rejected", reasonDecided: "terlalu besar" }, manajer());
    expect(rejected.status).toBe("rejected");
  });

  it("chat: tanpa alur konfirmasi (tanpa kode) R3 tidak bisa disetujui; lewat konfirmasi tercatat jujur", async () => {
    const id = await r3Void();
    await expect(tools.runAgentTool(owner(), "putuskan_approval", { id, keputusan: "approved" }, ctx)).rejects.toMatchObject({ code: "R3_STEP_UP_REQUIRED" });
    const ok = await tools.runAgentTool(owner(), "putuskan_approval", { id, keputusan: "approved" }, { ...ctx, confirmFlow: true, confirmedOperationId: "op-1", mcpConnection: { id: "c1", provider: "chatgpt" } });
    expect(ok.status).toBe("approved");
    expect((await row(id)).decidedVia).toBe("chatgpt");
    const preview = await tools.findAgentTool("putuskan_approval").preview(owner(), { id, keputusan: "approved" });
    expect(preview.nominal).toBe("Rp900.000");
  });

  it("SA-03: penutup shift tidak bisa menyetujui selisihnya sendiri; sign-off lama tidak ditimpa", async () => {
    const insertShift = async (extra: Record<string, unknown>) => {
      const [cs] = await t.getDb().insert(t.schema.cashSessions).values({
        code: `SH-POL-${Math.random().toString(36).slice(2, 6)}`, outletId, openingCash: 100_000, expectedCash: 500_000, actualCash: 450_000,
        discrepancy: -50_000, discrepancyStatus: "review", status: "closed", openedBy: MANAJER, closedBy: MANAJER, ...extra,
      } as any).returning();
      await approval(`APP-CASH-${cs.id}`, { type: "Selisih kas", amountValue: 50_000, payload: { cashSessionId: cs.id } });
      return cs;
    };
    const { eq } = await import("drizzle-orm");
    const own = await insertShift({});
    await expect(svc.decideApproval(`APP-CASH-${own.id}`, { status: "approved" }, manajer())).rejects.toThrow(/milik Anda/);
    expect((await row(`APP-CASH-${own.id}`)).status).toBe("pending");
    await svc.decideApproval(`APP-CASH-${own.id}`, { status: "approved" }, session(MANAJER2, "Manajer"));
    const [a] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, own.id));
    expect(a.managerSignOffBy).toBe(MANAJER2);

    const signed = await insertShift({ managerSignOffBy: OWNER, managerSignOffAt: new Date() });
    await svc.decideApproval(`APP-CASH-${signed.id}`, { status: "approved" }, session(MANAJER2, "Manajer"));
    const [b] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, signed.id));
    expect(b.managerSignOffBy).toBe(OWNER);
  });
});
