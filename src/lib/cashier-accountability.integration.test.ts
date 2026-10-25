import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Pertanggungjawaban kasir (owner, Okt 2026): pecahan modal awal, petty cash
// terpisah dari laci, catatan kejadian, verifikasi Manajer — dicek di backend.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let acc: any;
let outletId = "";
const CASHIER = "user-itest-acc-kasir";
const OWNER = "user-itest-acc-owner";
const NEWBIE = "user-itest-acc-new";

const as = (role: Role, id = role === "Kasir" ? CASHIER : OWNER) =>
  ({
    user: { id, name: `${role} Test`, email: `${id}@garage.id` },
    profile: {
      id: `sp-${id}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

async function sessionRow(openedBy: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.openedBy, openedBy));
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: CASHIER })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: OWNER, name: "Owner Test", email: `${OWNER}@garage.id` },
    { id: NEWBIE, name: "Manajer Baru", email: `${NEWBIE}@garage.id` },
  ]);
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("pecahan modal awal", () => {
  it("menolak hitungan yang tidak sama dengan modal awal dan menyimpan yang cocok", async () => {
    await expect(
      svc.createCashSession({ openingCash: 100_000, openingDenominations: { "50000": 1 } }, as("Manajer", NEWBIE)),
    ).rejects.toThrow(/tidak sama dengan modal awal/);
    await svc.createCashSession(
      { openingCash: 100_000, openingDenominations: { "50000": 1, "20000": 2, "5000": 1, "1000k": 5 } },
      as("Manajer", NEWBIE),
    );
    const row = await sessionRow(NEWBIE);
    expect(row.openingCash).toBe(100_000);
    expect(row.openingDenominations).toEqual({ "50000": 1, "20000": 2, "5000": 1, "1000k": 5 });
  });
});

describe("petty cash", () => {
  it("kasir hanya mengajukan; saldo hanya berubah setelah disetujui & dibayar dan tidak menyentuh laci", async () => {
    const before = (await sessionRow(CASHIER)).expectedCash;
    await expect(
      acc.createPettyCashEntry({ type: "topup", category: "Pengisian dana", description: "isi", amount: 10_000 }, as("Kasir")),
    ).rejects.toThrow(/hanya bisa mengajukan/);
    await acc.createPettyCashEntry(
      { type: "topup", category: "Pengisian dana", description: "Dana awal minggu", amount: 500_000 },
      as("Owner"),
    );
    const request = await acc.createPettyCashEntry(
      { type: "expense", category: "Kebersihan", description: "Sabun cuci", amount: 25_000, recipient: "Toko Maju" },
      as("Kasir"),
    );
    expect(request.status).toBe("submitted");

    let list = await acc.listPettyCashEntries({ outletId });
    let summary = acc.summarizePettyCash(list, 0);
    expect(summary.closingBalance).toBe(500_000);
    expect(summary.pendingExpenseTotal).toBe(25_000);

    await expect(acc.decidePettyCashEntry(request.id, { decision: "approve" }, as("Kasir"))).rejects.toThrow(/Owner\/Manajer/);
    await acc.decidePettyCashEntry(request.id, { decision: "approve" }, as("Manajer"));
    await expect(acc.decidePettyCashEntry(request.id, { decision: "approve" }, as("Manajer"))).rejects.toThrow(/sudah/);
    // Disetujui ≠ dibayar: saldo baru berkurang saat uang diserahkan.
    expect(acc.summarizePettyCash(await acc.listPettyCashEntries({ outletId }), 0).closingBalance).toBe(500_000);
    await acc.decidePettyCashEntry(request.id, { decision: "pay" }, as("Manajer"));

    const rejected = await acc.createPettyCashEntry(
      { type: "expense", category: "Lain-lain", description: "Tidak jelas", amount: 90_000 },
      as("Kasir"),
    );
    await expect(acc.decidePettyCashEntry(rejected.id, { decision: "reject" }, as("Owner"))).rejects.toThrow(/Alasan/);
    await acc.decidePettyCashEntry(rejected.id, { decision: "reject", note: "Tanpa nota" }, as("Owner"));

    list = await acc.listPettyCashEntries({ outletId });
    summary = acc.summarizePettyCash(list, 0);
    expect(summary.closingBalance).toBe(475_000);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.ledger.at(-1).runningBalance).toBeNull();
    expect((await sessionRow(CASHIER)).expectedCash).toBe(before);
    expect(await acc.pettyCashBalanceBefore(outletId, new Date(Date.now() + 60_000))).toBe(475_000);
  });
});

describe("catatan kejadian & verifikasi", () => {
  it("kasir mencatat kejadian di shift sendiri; catatan Manajer & verifikasi hanya Owner/Manajer", async () => {
    const incident = await acc.createShiftIncident(
      { category: "Gangguan QRIS", description: "QRIS BNI timeout 10 menit", financialImpact: 0 },
      as("Kasir"),
    );
    const session = await sessionRow(CASHIER);
    expect(incident.cashSessionId).toBe(session.id);
    await expect(
      acc.updateShiftIncident(incident.id, { managerNote: "ok" }, as("Kasir")),
    ).rejects.toThrow(/Owner\/Manajer/);
    // P4: pelapor menulis tindakan, tapi tidak menutup kejadiannya sendiri.
    await expect(
      acc.updateShiftIncident(incident.id, { status: "resolved", actionTaken: "Pakai transfer" }, as("Kasir")),
    ).rejects.toMatchObject({ code: "INDEPENDENT_REVIEW_REQUIRED" });
    await acc.updateShiftIncident(incident.id, { actionTaken: "Pakai transfer" }, as("Kasir"));
    await acc.updateShiftIncident(incident.id, { status: "resolved", managerNote: "Hubungi BNI" }, as("Manajer"));
    const [listed] = await acc.listShiftIncidents({ cashSessionIds: [session.id] });
    expect(listed).toMatchObject({ status: "resolved", actionTaken: "Pakai transfer", managerNote: "Hubungi BNI" });
    expect(listed.resolvedByName).toBe("Owner Test");

    await expect(acc.reviewCashSession(session.id, { status: "verified" }, as("Kasir"))).rejects.toThrow(/Owner\/Manajer/);
    await expect(acc.reviewCashSession(session.id, { status: "verified" }, as("Owner"))).rejects.toThrow(/masih berlangsung/);
    const newbieSession = await sessionRow(NEWBIE);
    await expect(
      acc.createShiftIncident({ cashSessionId: newbieSession.id, category: "Lainnya", description: "bukan shift saya" }, as("Kasir")),
    ).rejects.toThrow(/miliknya sendiri/);
  });

  it("verifikasi setelah shift ditutup tercatat di audit", async () => {
    const { eq } = await import("drizzle-orm");
    const session = await sessionRow(CASHIER);
    await t.getDb().update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.id, session.id));
    await expect(acc.reviewCashSession(session.id, { status: "needs_followup" }, as("Manajer"))).rejects.toThrow(/tindak lanjut/);
    await acc.reviewCashSession(session.id, { status: "verified", note: "Cocok" }, as("Manajer"));
    const row = await sessionRow(CASHIER);
    expect(row.reviewStatus).toBe("verified");
    expect(row.reviewedBy).toBe(OWNER);
    const logs = await t.getDb().select().from(t.schema.auditLogs);
    expect(logs.some((log: any) => log.action === "Laporan shift diverifikasi")).toBe(true);
  });
});
