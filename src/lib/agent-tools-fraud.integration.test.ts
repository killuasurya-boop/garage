import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Fraud Watch lewat MCP (blueprint V3 §6.1/§10.4, AC-24/25): Owner melihat semua outlet, Manajer hanya
// outletnya, Kasir ditolak; detail membawa bukti + kelengkapan + kasus audit; selalu ada catatan
// "bukan tuduhan"; tool hanya membaca (alert tidak berubah).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletA = "";
let outletB = "";
let tools: typeof import("@/lib/agent-tools");
const OWNER = "user-fw-owner";
const MANAJER = "user-fw-manajer";
const KASIR = "user-fw-kasir";
const ids: Record<string, string> = {};

function as(userId: string, role: Role, outletId: string): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "WEB",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId: outletA } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  const [b] = await d.insert(t.schema.outlets).values({ code: "TSB", name: "Outlet B" }).returning();
  outletB = b.id;
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer A", email: `${MANAJER}@garage.id` },
    { id: KASIR, name: "Kasir A", email: `${KASIR}@garage.id` },
  ]);
  const [kasus] = await d
    .insert(t.schema.auditCases)
    .values({ flagKind: "risk", severity: "high", title: "Kasus uji selisih", description: "uji", status: "open", createdBy: OWNER } as any)
    .returning();
  const rows = await d
    .insert(t.schema.riskAlerts)
    .values([
      {
        dedupeKey: "fw-a-1",
        ruleId: "CASH_SHORTAGE",
        ruleVersion: 1,
        riskLevel: 4,
        title: "Selisih kurang di atas batas",
        explanation: "Kas fisik Rp50.000 di bawah kas seharusnya.",
        eventAt: new Date("2026-10-28T10:00:00Z"),
        outletId: outletA,
        personUserId: KASIR,
        personRole: "Kasir",
        custodyScope: "cashier",
        evidence: [{ type: "cash_session", ref: "CS-UJI-1", label: "Shift CS-UJI-1" }],
        completeness: "complete",
        auditCaseId: kasus.id,
      },
      {
        dedupeKey: "fw-b-1",
        ruleId: "QRIS_MISMATCH",
        ruleVersion: 1,
        riskLevel: 2,
        title: "QRIS belum cocok",
        explanation: "Total QRIS aplikasi ≠ tercatat.",
        eventAt: new Date("2026-10-28T11:00:00Z"),
        outletId: outletB,
        custodyScope: "bank",
        evidence: [{ type: "payment", ref: "PAY-1", label: "Pembayaran QRIS" }],
        completeness: "partial",
      },
    ] as any)
    .returning();
  ids.a = rows[0].id;
  ids.b = rows[1].id;
  tools = await import("@/lib/agent-tools");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("garage_list_anomaly_cases", () => {
  it("Owner: semua outlet, urut level, dengan catatan bukan-tuduhan & ringkasan per level", async () => {
    const res = (await tools.runAgentTool(as(OWNER, "Owner", outletA), "garage_list_anomaly_cases", {}, ctx)) as any;
    expect(res.catatan).toMatch(/BUKAN tuduhan/);
    expect(res.alerts.map((a: any) => a.id)).toEqual([ids.a, ids.b]);
    expect(res.perLevel).toEqual({ LV4: 1, LV2: 1 });
    expect(res.alerts[0]).toMatchObject({ aturan: "CASH_SHORTAGE v1", kelengkapanData: "complete", status: "OPEN", kasusAudit: expect.any(String) });
  });

  it("Manajer hanya outletnya; filter level minimal", async () => {
    const res = (await tools.runAgentTool(as(MANAJER, "Manajer", outletA), "garage_list_anomaly_cases", {}, ctx)) as any;
    expect(res.alerts.map((a: any) => a.id)).toEqual([ids.a]);
    const high = (await tools.runAgentTool(as(OWNER, "Owner", outletA), "garage_list_anomaly_cases", { minLevel: 3 }, ctx)) as any;
    expect(high.alerts.map((a: any) => a.id)).toEqual([ids.a]);
  });

  it("Kasir ditolak", async () => {
    await expect(tools.runAgentTool(as(KASIR, "Kasir", outletA), "garage_list_anomaly_cases", {}, ctx)).rejects.toMatchObject({ status: 403 });
  });
});

describe("garage_get_anomaly_case", () => {
  it("detail: bukti, kelengkapan, kasus audit terkait; alert tidak berubah (hanya baca)", async () => {
    const { eq } = await import("drizzle-orm");
    const res = (await tools.runAgentTool(as(OWNER, "Owner", outletA), "garage_get_anomaly_case", { alertId: ids.a }, ctx)) as any;
    expect(res.alert.bukti).toEqual([{ type: "cash_session", ref: "CS-UJI-1", label: "Shift CS-UJI-1" }]);
    expect(res.kasusAudit).toMatchObject({ judul: "Kasus uji selisih", status: "open" });
    expect(res.tindakLanjut).toMatch(/manusia/);
    const [row] = await t.getDb().select().from(t.schema.riskAlerts).where(eq(t.schema.riskAlerts.id, ids.a));
    expect(row.disposition).toBe("OPEN");
    expect(row.reviewedBy).toBeNull();
  });

  it("Manajer outlet A tidak bisa membuka alert outlet B", async () => {
    await expect(
      tools.runAgentTool(as(MANAJER, "Manajer", outletA), "garage_get_anomaly_case", { alertId: ids.b }, ctx),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("registry: R0 keuangan, bukan tool tulis", () => {
    const meta = Object.fromEntries(tools.listAgentTools().map((tool) => [tool.name, tool]));
    expect(meta.garage_list_anomaly_cases).toMatchObject({ domain: "keuangan", risk: "R0", write: false });
    expect(meta.garage_get_anomaly_case).toMatchObject({ domain: "keuangan", risk: "R0", write: false });
  });
});
