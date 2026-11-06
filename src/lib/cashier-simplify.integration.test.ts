import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cashDrawerCategory, cashDrawerNeedsApproval } from "@/lib/cash-drawer";
import type { Role } from "@/lib/garage-data";
import { openingCashError } from "@/lib/opening-cash";
import type { GarageSession } from "@/lib/server-auth";
import { cashCount } from "@/lib/test-helpers/cash-count";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Owner 6 Nov 2026 — kasir lebih mudah tapi tetap teliti:
// (1) modal awal laci bebas (kelipatan Rp100, mis. Rp55.200) sampai batas Pengaturan, pecahan tetap wajib cocok;
// (2) tutup shift cukup hitung sekali (setelan hitung ganda default mati);
// (3) kas keluar/masuk langsung tercatat tanpa ACC, kecuali kasbon & refund pelanggan, atau bila total kas keluar
//     shift melewati batas; yang tanpa nota muncul di Kontrol Kas. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-simple-kasir";
const MANAJER = "user-simple-manajer";

function sessionFor(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
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
const kasir = () => sessionFor(KASIR, "Sari", "Kasir");
const manajer = () => sessionFor(MANAJER, "Mira", "Manajer");

async function expectedCash(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row.expectedCash;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  const d = t.getDb();
  await d.delete(t.schema.cashSessions);
  await d.insert(t.schema.user).values({ id: MANAJER, name: "Mira", email: `${MANAJER}@garage.id` });
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active" },
  ] as any).onConflictDoNothing();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("aturan murni", () => {
  it("modal awal: bebas kelipatan Rp100 sampai batas; contoh Owner diterima", () => {
    for (const ok of [55_200, 456_000, 137_500, 100]) expect(openingCashError(ok, 2_000_000)).toBeNull();
    expect(openingCashError(55_250, 2_000_000)).toMatch(/kelipatan Rp100/);
    expect(openingCashError(0, 2_000_000)).toMatch(/lebih dari Rp0/);
    expect(openingCashError(2_000_100, 2_000_000)).toMatch(/maksimal/);
  });

  it("kas laci: bebas ACC kecuali kasbon & refund, atau melewati batas shift", () => {
    const def = (key: string) => cashDrawerCategory(key)!;
    expect(cashDrawerNeedsApproval(def("belanja_bar"), 400_000, { outTotalBefore: 0, limit: 1_000_000 })).toBe(false);
    expect(cashDrawerNeedsApproval(def("setoran"), 2_000_000)).toBe(false);
    expect(cashDrawerNeedsApproval(def("kasbon"), 10_000)).toBe(true);
    expect(cashDrawerNeedsApproval(def("refund_pelanggan"), 10_000)).toBe(true);
    expect(cashDrawerNeedsApproval(def("belanja_bar"), 300_000, { outTotalBefore: 800_000, limit: 1_000_000 })).toBe(true);
    expect(cashDrawerNeedsApproval(def("kembalian"), 5_000_000, { outTotalBefore: 900_000, limit: 1_000_000 })).toBe(false);
    expect(cashDrawerNeedsApproval(def("belanja_bar"), 9_000_000, { outTotalBefore: 0, limit: 0 })).toBe(false);
  });
});

describe("alur kasir (DB)", () => {
  let sessionId = "";

  it("buka shift dengan modal Rp55.200 (pecahan cocok); melebihi batas ditolak server", async () => {
    await expect(svc.createCashSession({ openingCash: 2_500_000 } as any, kasir())).rejects.toMatchObject({ code: "OPENING_CASH_INVALID" });
    await expect(
      svc.createCashSession({ openingCash: 55_200, openingDenominations: cashCount(55_000) } as any, kasir()),
    ).rejects.toMatchObject({ code: "OPENING_DENOMINATION_MISMATCH" });
    const opened: any = await svc.createCashSession({ openingCash: 55_200, openingDenominations: cashCount(55_200) } as any, kasir());
    sessionId = opened.id;
    expect(opened.openingCash).toBe(55_200);
    expect(await expectedCash(sessionId)).toBe(55_200);
  });

  it("kas keluar Rp300.000 langsung tercatat tanpa PIN & memotong laci; setoran juga", async () => {
    await svc.recordCashMovement({ type: "in", categoryKey: "modal", description: "Tambah modal dari Owner", amount: 1_000_000, counterparty: "Owner" } as any, kasir());
    const out: any = await svc.recordCashMovement({ type: "out", categoryKey: "belanja_bar", description: "Beli susu 10 liter", amount: 300_000 }, kasir());
    expect(out.status).toBe("recorded");
    expect(out.approvedByName).toBeNull();
    expect(await expectedCash(sessionId)).toBe(55_200 + 1_000_000 - 300_000);
    const deposit: any = await svc.recordCashMovement(
      { type: "out", categoryKey: "setoran", description: "Setor ke Jago", amount: 200_000, depositAccount: "bank_jago", counterparty: "Sari" } as any,
      kasir(),
    );
    expect(deposit.status).toBe("recorded");
  });

  it("kasbon tetap perlu ACC; total kas keluar melewati batas shift → minta PIN", async () => {
    await expect(
      svc.recordCashMovement({ type: "out", categoryKey: "kasbon", description: "Kasbon", amount: 20_000, employeeUserId: KASIR } as any, kasir()),
    ).rejects.toMatchObject({ code: "MANAGER_PIN_REQUIRED" });
    // Sudah keluar 300.000 + setoran 200.000 = 500.000; batas default Rp1.000.000.
    await expect(
      svc.recordCashMovement({ type: "out", categoryKey: "belanja_dapur", description: "Belanja besar", amount: 600_000 }, kasir()),
    ).rejects.toMatchObject({ code: "MANAGER_PIN_REQUIRED" });
    const asRequest: any = await svc.recordCashMovement(
      { type: "out", categoryKey: "belanja_dapur", description: "Belanja besar", amount: 600_000, submitForApproval: true } as any,
      kasir(),
    );
    expect(asRequest.status).toBe("pending_approval");
  });

  it("kas keluar ≥ Rp50.000 tanpa foto nota muncul di Kontrol Kas", async () => {
    const { getCashOversight } = await import("@/lib/cash-oversight");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const overview: any = await getCashOversight({ fromDate: today, toDate: today });
    const items = overview.queues.cash_out_no_receipt;
    expect(items.some((i: any) => i.amount === 300_000)).toBe(true);
    // Setoran bukan biaya — tidak masuk antrean nota.
    expect(items.some((i: any) => i.amount === 200_000)).toBe(false);
  });

  it("tutup shift cukup hitung sekali (tanpa hitungan #2)", async () => {
    const expected = await expectedCash(sessionId);
    const closed: any = await svc.closeCashSession(sessionId, { actualCash: expected, denominations: cashCount(expected), depositAccount: "bank_jago" } as any, kasir());
    expect(closed.status).toBe("closed");
  });

  it("rule risiko: kas keluar langsung yang besar menjadi prioritas pemeriksaan (bukan tuduhan)", async () => {
    const { evaluateSessionRisk } = await import("@/lib/risk-rules");
    const drafts = evaluateSessionRisk({
      sessionId: "s1", code: "SH-1", outletId, businessDate: "2026-11-06", closedAt: new Date(), cashierId: KASIR, cashierName: "Sari",
      expectedCash: 0, actualCash: 0, discrepancy: 0, ledgerBalance: 0, countSkippedReason: null, qrisDiscrepancy: null,
      reviewSelfVerified: false, reviewedBy: null, countKinds: ["count_1"], refundVoidCount: 0, methodFixCount: 0,
      unconfirmedDeposits: [], history: { shifts: 1, shortageShifts: 0, mismatchShifts: 0 }, threshold: 50_000, now: new Date(),
      cashOutDirect: { count: 2, total: 900_000, withoutReceipt: 1, limit: 1_000_000 },
    } as any);
    const alert = drafts.find((a: any) => a.ruleId === "CASH_OUT_DIRECT_HIGH");
    expect(alert?.riskLevel).toBe(1);
    expect(JSON.stringify(alert)).not.toMatch(/curang|pelaku|mencuri|fraud/i);
    void manajer;
  });
});

beforeAll(async () => {
  svc = await import("@/lib/garage-service");
});
