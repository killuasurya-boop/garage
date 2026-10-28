import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { cashCount } from "@/lib/test-helpers/cash-count";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import { enableTestTotp, freshTotpCode } from "@/lib/test-helpers/owner-totp";

// =============================================================================
// B7b (PRD §13.5, §16.1, §20.2): Owner 360 harian, ledger bulanan, dossier kasus
// dari data nyata (shift ditutup + diverifikasi + final Owner 2FA) dan PDF B/C/D.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let acc: typeof import("@/lib/cashier-accountability");
let fin: typeof import("@/lib/cash-final-approval");
let reports: typeof import("@/lib/owner-reports");
let pdf: typeof import("@/lib/owner-reports-pdf");
let outletId = "";
const KASIR = "user-b7b-kasir";
const MANAJER = "user-b7b-manajer";
const OWNER = "user-b7b-owner";
const PIN = "582014";
let today = "";
const ids: Record<string, string> = {};

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

/** Buka (modal 100rb) → tutup dengan hitungan #1 = #2 = `counted` → verifikasi Manajer. */
async function verifiedShift(counted: number) {
  const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  await svc.closeCashSession(opened.id, { actualCash: counted, denominations: cashCount(counted), recountDenominations: cashCount(counted) }, kasir());
  await acc.reviewCashSession(
    opened.id,
    counted === 100_000 ? { status: "verified" } : { status: "verified", acknowledgeDiscrepancy: true, note: "Selisih diakui pemeriksa." },
    manajer(),
  );
  return opened.id as string;
}

async function finalize(id: string, decision: "approve" | "approve_with_exception") {
  const preview = await fin.getFinalApprovalPreview(id, owner());
  await fin.decideFinalApproval(
    id,
    { decision, note: decision === "approve" ? null : "Selisih kecil, diterima dengan catatan.", challengeId: preview.challengeId, nonce: preview.nonce, code: await freshTotpCode(t, OWNER) },
    owner(),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  fin = await import("@/lib/cash-final-approval");
  reports = await import("@/lib/owner-reports");
  pdf = await import("@/lib/owner-reports-pdf");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer B7", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner B7", email: `${OWNER}@garage.id` },
  ] as any);
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: KASIR, outletId, role: "Kasir", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
      { userId: OWNER, outletId, role: "Owner", status: "active" },
    ])
    .onConflictDoNothing();
  await enableTestTotp(t, OWNER);
  // Sesi bawaan seed dihapus supaya angka tanggal ini hanya dari shift tes.
  await d.delete(t.schema.cashSessions).where(eq(t.schema.cashSessions.outletId, outletId));
  const { jakartaDateKey } = await import("@/lib/cash-oversight");
  today = jakartaDateKey(new Date());

  ids.clean = await verifiedShift(100_000);
  await finalize(ids.clean, "approve");
  ids.short = await verifiedShift(95_000);
  await finalize(ids.short, "approve_with_exception");
  ids.over = await verifiedShift(103_000); // belum final Owner
}, 120_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Owner 360 harian (PDF B CLOSING)", () => {
  it("menggabungkan semua shift tanggal itu; kurang & lebih terpisah; DRAFT selama ada shift belum final", async () => {
    const d = await reports.getDailyDossier({ outletId, date: today });
    expect(d.shifts.map((s) => s.id)).toEqual([ids.clean, ids.short, ids.over]);
    expect(d.summary.shortage).toBe(5_000);
    expect(d.summary.surplus).toBe(3_000);
    expect(d.summary.approval).toMatchObject({ final: 2, withException: 1, pending: 1 });
    expect(d.status).toBe("pending");
    expect(d.meta.final).toBe(false);
    expect(d.snapshots.map((s) => s.reportId)).toHaveLength(2);
    expect(d.timeline.some((e) => e.kind === "final")).toBe(true);
    expect(d.monthToDate).toMatchObject({ shortage: 5_000, surplus: 3_000 });
    expect(d.meta.fileName).toBe(`GARAGE_OUTLET_TEST_CLOSING_${today}.pdf`);

    const buffer = await pdf.renderDailyClosingPdf(d);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5_000);
  });

  it("final setelah shift terakhir disahkan Owner", async () => {
    await finalize(ids.over, "approve_with_exception");
    const d = await reports.getDailyDossier({ outletId, date: today });
    expect(d.status).toBe("final");
    expect(d.meta.final).toBe(true);
  });
});

describe("Ledger bulanan (PDF C FINANCIAL_AUDIT)", () => {
  it("kurang/lebih per kasir & per hari, final status, roll-forward kasus", async () => {
    const m = await reports.getMonthlyLedger({ outletId, from: `${today.slice(0, 8)}01`, to: today });
    expect(m.totals).toMatchObject({ closedShifts: 3, shiftsWithVariance: 2, shortage: 5_000, surplus: 3_000 });
    expect(m.totals.finals).toMatchObject({ approved: 1, withException: 2, pending: 0 });
    expect(m.cashiers).toHaveLength(1);
    expect(m.cashiers[0]).toMatchObject({ shifts: 3, shiftsWithVariance: 2 });
    expect(m.reviewers[0]).toMatchObject({ name: "Manajer B7", reviewed: 3 });
    expect(m.meta.final).toBe(true);
    const buffer = await pdf.renderMonthlyAuditPdf(m);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rentang terbalik ditolak", async () => {
    await expect(reports.getMonthlyLedger({ outletId, from: "2026-10-10", to: "2026-10-01" })).rejects.toMatchObject({ code: "INVALID_RANGE" });
  });
});

describe("Buku kas rinci & arus kas (F38/F35)", () => {
  it("buku kas periode cocok dengan saldo DB; modal shift tercatat; PDF & Excel jadi", async () => {
    const ledger = await import("@/lib/cash-ledger-report");
    const r = await ledger.getCashLedgerReport({ from: `${today.slice(0, 8)}01`, to: today });
    const drawer = r.accounts.find((a) => a.account === "drawer")!;
    expect(r.totals.unreconciled).toEqual([]);
    expect(drawer.bySource.find((s) => s.sourceType === "opening")).toMatchObject({ count: 3, inflow: 300_000 });
    expect(drawer.lines.at(-1)?.running).toBe(drawer.closing);
    expect(r.entries.every((e) => e.id && e.seq > 0)).toBe(true);

    const { renderCashLedgerPdf } = await import("@/lib/cash-ledger-pdf");
    expect((await renderCashLedgerPdf(r)).subarray(0, 5).toString()).toBe("%PDF-");
    const { cashLedgerWorkbook } = await import("@/lib/cash-ledger-xlsx");
    const xlsx = await cashLedgerWorkbook(r);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as never);
    expect(wb.worksheets.map((s) => s.name)).toEqual(expect.arrayContaining(["Ringkasan", "Arus per jenis", "Pergerakan dana", "Laci kasir"]));
    expect(wb.getWorksheet("Pergerakan dana")!.rowCount).toBe(3 + r.entries.length);
  });

  it("rentang terlalu panjang ditolak", async () => {
    const ledger = await import("@/lib/cash-ledger-report");
    await expect(ledger.getCashLedgerReport({ from: "2026-01-01", to: "2026-10-01" })).rejects.toMatchObject({ code: "RANGE_TOO_LONG" });
  });
});

describe("Dossier kasus (PDF D CASE)", () => {
  it("kasus dari alert risiko memuat bukti & shift terkait; tidak ditemukan → 404", async () => {
    const d = t.getDb();
    const [created] = await d
      .insert(t.schema.auditCases)
      .values({ flagKind: "risk:R-TEST", severity: "warning", actorName: "Nama kasir", title: "Selisih kurang shift", status: "open", createdBy: OWNER, notes: [{ by: OWNER, byName: "Owner B7", text: "Minta penjelasan tertulis", at: new Date().toISOString() }] } as any)
      .returning();
    await d.insert(t.schema.riskAlerts).values({
      dedupeKey: `test:${ids.short}`,
      ruleId: "R-TEST",
      ruleVersion: 1,
      riskLevel: 3,
      title: "Selisih kurang",
      explanation: "Kas fisik Rp5.000 di bawah kas seharusnya",
      eventAt: new Date(),
      outletId,
      cashSessionId: ids.short,
      personUserId: KASIR,
      personRole: "Kasir",
      custodyScope: "cashier",
      evidence: [{ type: "cash_session", ref: ids.short, label: "Shift kurang" }],
      auditCaseId: created.id,
    } as any);

    const c = await reports.getCaseDossier({ caseId: created.id, outletId });
    expect(c.meta.final).toBe(false);
    expect(c.sessions).toEqual([expect.objectContaining({ id: ids.short, variance: -5_000 })]);
    expect(c.evidence[0]).toMatchObject({ ruleId: "R-TEST" });
    expect(c.timeline.some((e) => /Minta penjelasan/.test(e.label))).toBe(true);
    expect(c.meta.fileName).toMatch(/^GARAGE_OUTLET_TEST_CASE_CASE-[0-9A-F]{8}\.pdf$/);
    const buffer = await pdf.renderCasePdf(c);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");

    // Dossier harian ikut memuat alert & kasus terkait.
    const daily = await reports.getDailyDossier({ outletId, date: today });
    expect(daily.alerts.map((a) => a.ruleId)).toContain("R-TEST");
    expect(daily.cases.map((x) => x.id)).toContain(created.id);
    expect(daily.summary.openCases).toBe(1);

    await expect(reports.getCaseDossier({ caseId: crypto.randomUUID(), outletId })).rejects.toMatchObject({ code: "CASE_NOT_FOUND", status: 404 });
  });
});
