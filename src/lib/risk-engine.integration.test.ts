import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// B6 (PRD §14): alert risiko tersimpan idempoten; keputusan manusia tidak ditimpa mesin;
// Manajer tidak memeriksa alert tentang dirinya; kesimpulan akhir hanya Owner.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let risk: typeof import("@/lib/risk-engine");
let outletId = "";
const KASIR = "user-b6-kasir";
const MANAJER = "user-b6-manajer";
const OWNER = "user-b6-owner";
const PIN = "731905";

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => as(KASIR, "Kasir");
const manajer = () => as(MANAJER, "Manajer");
const owner = () => as(OWNER, "Owner");

async function closeShift(counted: number, extra: Record<string, unknown> = {}) {
  const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  await svc.closeCashSession(
    opened.id,
    { actualCash: counted, denominations: cashCount(counted), recountDenominations: cashCount(counted), managerPin: PIN, ...extra } as any,
    kasir(),
  );
  return opened.id as string;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  risk = await import("@/lib/risk-engine");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer B6", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner B6", email: `${OWNER}@garage.id` },
  ]);
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: KASIR, outletId, role: "Kasir", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
      { userId: OWNER, outletId, role: "Owner", status: "active" },
    ])
    .onConflictDoNothing();
  const open = await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  for (const s of open) {
    await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.id, s.id));
  }
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("B6 risk engine", () => {
  it("shift kurang Rp60rb → LV4 CASH_SHORTAGE; pindai ulang tidak menggandakan", async () => {
    const id = await closeShift(40_000);
    expect((await risk.scanRiskForSession(id)).alerts).toBe(1);
    await risk.scanRiskForSession(id);
    const alerts = (await risk.listRiskAlerts({ disposition: "ALL" }, owner())).filter((a) => a.cashSessionId === id);
    expect(alerts.map((a) => [a.ruleId, a.riskLevel, a.disposition, a.custodyScope])).toEqual([["CASH_SHORTAGE", 4, "OPEN", "cashier"]]);
    expect(alerts[0]).toMatchObject({ personRole: "Kasir", viewerIsSubject: false });
  });

  it("disposisi manusia tidak ditimpa pindai ulang; catatan wajib; kesimpulan akhir hanya Owner", async () => {
    const id = await closeShift(95_000);
    await risk.scanRiskForSession(id);
    const [alert] = (await risk.listRiskAlerts({ disposition: "OPEN" }, owner())).filter((a) => a.cashSessionId === id);
    await expect(risk.decideRiskAlert(alert.id, { disposition: "EXPLAINED" }, manajer())).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    await expect(
      risk.decideRiskAlert(alert.id, { disposition: "SUBSTANTIATED", note: "Manajer mencoba menyimpulkan." }, manajer()),
    ).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await risk.decideRiskAlert(alert.id, { disposition: "EXPLAINED", note: "Kembalian salah Rp5.000, sudah dicek CCTV." }, manajer());
    await risk.scanRiskForSession(id);
    const [after] = (await risk.listRiskAlerts({ disposition: "ALL" }, owner())).filter((a) => a.id === alert.id);
    expect(after).toMatchObject({ disposition: "EXPLAINED", reviewerName: "Manajer B6" });
  });

  it("Manajer tidak memeriksa alert tentang dirinya; Kasir tidak bisa melihat alert", async () => {
    const id = await closeShift(100_000);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.cashSessions).set({ openedBy: MANAJER, discrepancy: -20_000 }).where(eq(t.schema.cashSessions.id, id));
    await risk.scanRiskForSession(id);
    const mine = (await risk.listRiskAlerts({ disposition: "OPEN" }, manajer())).find((a) => a.cashSessionId === id)!;
    expect(mine.viewerIsSubject).toBe(true);
    await expect(
      risk.decideRiskAlert(mine.id, { disposition: "FALSE_POSITIVE", note: "Saya rasa tidak ada masalah." }, manajer()),
    ).rejects.toMatchObject({ code: "INDEPENDENT_REVIEW_REQUIRED" });
    await expect(risk.listRiskAlerts({}, kasir())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("jadikan kasus → audit_cases tanpa kesimpulan; idempoten", async () => {
    const id = await closeShift(40_000);
    await risk.scanRiskForSession(id);
    const [alert] = (await risk.listRiskAlerts({ disposition: "OPEN" }, owner())).filter((a) => a.cashSessionId === id);
    const first = await risk.escalateRiskAlert(alert.id, owner());
    const again = await risk.escalateRiskAlert(alert.id, owner());
    expect(again.auditCaseId).toBe(first.auditCaseId);
    const { eq } = await import("drizzle-orm");
    const [createdCase] = await t.getDb().select().from(t.schema.auditCases).where(eq(t.schema.auditCases.id, first.auditCaseId));
    expect(createdCase).toMatchObject({ flagKind: "risk:CASH_SHORTAGE", severity: "critical", status: "open" });
    expect(createdCase.description).toMatch(/tanpa kesimpulan/);
  });

  it("scanRecentRisk memindai shift tertutup dalam jendela hari", async () => {
    const result = await risk.scanRecentRisk({ days: 7 });
    expect(result.sessions).toBeGreaterThan(0);
  });
});
