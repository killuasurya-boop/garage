import { describe, expect, it } from "vitest";

import {
  buildCaseDossier,
  buildDailyDossier,
  buildMonthlyLedger,
  caseCode,
  officialCaseFileName,
  officialClosingFileName,
  officialMonthlyFileName,
  shiftExceptions,
  splitVariance,
  type DailyDossierInput,
  type DossierShiftInput,
  type MonthlyShiftRow,
} from "@/lib/owner-reports-build";

// B7b (PRD §13.5, §16.1, §20.2): agregasi laporan resmi Owner.

function shift(overrides: Partial<DossierShiftInput> = {}): DossierShiftInput {
  return {
    id: "s1",
    code: "SHF-1",
    shiftNumber: 1,
    cashierName: "Kasir A",
    openedAt: "2026-10-20T08:00:00.000Z",
    closedAt: "2026-10-20T15:00:00.000Z",
    status: "closed",
    openingCash: 100_000,
    cashSales: 400_000,
    cashIn: 0,
    cashOut: 0,
    cashRefundsVoids: 0,
    financeCashOut: 0,
    methodCorrections: 0,
    otherAdjustments: 0,
    expected: 500_000,
    actual: 500_000,
    recountCash: null,
    floatLeft: 100_000,
    deposit: 400_000,
    grossSales: 600_000,
    netSales: 600_000,
    paidCount: 20,
    voidCount: 0,
    refundTotal: 0,
    qris: 200_000,
    transfer: 0,
    otherNonCash: 0,
    qrisRecorded: 200_000,
    qrisCounted: 200_000,
    qrisDiscrepancy: 0,
    reviewStatus: "verified",
    reviewedByName: "Manajer",
    reviewedAt: "2026-10-20T16:00:00.000Z",
    reviewSelfVerified: false,
    discrepancyAcknowledged: false,
    countSkippedReason: null,
    finalStatus: "approved",
    finalVersion: 1,
    finalReportId: "FIN-SHF-1-V01",
    finalSummaryHash: "abc",
    finalDecidedByName: "Owner",
    finalDecidedAt: "2026-10-20T17:00:00.000Z",
    finalNote: null,
    counts: [
      { kind: "count_1", total: 500_000, at: "2026-10-20T15:00:00.000Z", countedByName: "Kasir A" },
      { kind: "count_2", total: 500_000, at: "2026-10-20T15:01:00.000Z", countedByName: "Kasir A" },
    ],
    incidents: [],
    events: [],
    ...overrides,
  };
}

function dailyInput(shifts: DossierShiftInput[], overrides: Partial<DailyDossierInput> = {}): DailyDossierInput {
  return {
    date: "2026-10-20",
    outletName: "Tebing Tinggi",
    shifts,
    alerts: [],
    cases: [],
    deposits: [],
    snapshots: [],
    pettyClosingBalance: 250_000,
    monthToDate: null,
    generatedAt: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("aturan dasar", () => {
  it("kurang & lebih tidak dinetkan", () => {
    expect(splitVariance([-5_000, 3_000, null, 0])).toEqual({ shortage: 5_000, surplus: 3_000 });
  });

  it("nama file resmi PRD §20.2 (tanggal = business date, revisi _V02)", () => {
    expect(officialClosingFileName({ outletName: "Tebing Tinggi", date: "2026-10-20", version: 1 })).toBe("GARAGE_TEBING_TINGGI_CLOSING_2026-10-20.pdf");
    expect(officialClosingFileName({ outletName: "Tebing Tinggi", date: "2026-10-20", version: 2 })).toBe("GARAGE_TEBING_TINGGI_CLOSING_2026-10-20_V02.pdf");
    expect(officialMonthlyFileName({ outletName: "Tebing Tinggi", month: "2026-10" })).toBe("GARAGE_TEBING_TINGGI_FINANCIAL_AUDIT_2026-10.pdf");
    const id = "1a2b3c4d-0000-4000-8000-000000000000";
    expect(caseCode(id)).toBe("CASE-1A2B3C4D");
    expect(officialCaseFileName({ outletName: "Tebing Tinggi", caseId: id })).toBe("GARAGE_TEBING_TINGGI_CASE_CASE-1A2B3C4D.pdf");
  });

  it("pengecualian shift memakai bahasa netral", () => {
    const list = shiftExceptions(
      shift({
        actual: 495_000,
        recountCash: 497_000,
        countSkippedReason: "printer mati",
        reviewSelfVerified: true,
        qrisDiscrepancy: 1_000,
        counts: [
          { kind: "count_1", total: 490_000, at: "x", countedByName: null },
          { kind: "count_2", total: 495_000, at: "y", countedByName: null },
        ],
        incidents: [{ status: "open", category: "x", description: "y", at: "z" }],
      }),
    );
    expect(list).toHaveLength(7);
    for (const label of list) expect(label).not.toMatch(/curang|pencuri|mencuri|pelaku|bersalah|fraud/i);
  });

  it("#1 ≠ #2 per pecahan (total sama) tetap terdeteksi lewat hitungan #3", () => {
    const counts = [
      { kind: "count_1", total: 100_000, at: "a", countedByName: null },
      { kind: "count_2", total: 100_000, at: "b", countedByName: null },
      { kind: "count_3", total: 90_000, at: "c", countedByName: null },
    ];
    expect(shiftExceptions(shift({ counts, actual: 90_000, expected: 100_000 }))).toContain("Hitungan #1 ≠ #2 (dipakai hitungan #3)");
    const d = buildDailyDossier(dailyInput([shift({ counts, actual: 90_000, expected: 100_000 })]));
    expect(d.shifts[0]).toMatchObject({ count1: 100_000, count2: 100_000, count3: 90_000, variance: -10_000 });
  });

  it("simbol yang tidak ada di font PDF diganti ASCII", async () => {
    const { pdfSafe } = await import("@/lib/shift-accountability-pdf");
    expect(pdfSafe("Hitungan #1 ≠ #2 · −Rp5.000")).toBe("Hitungan #1 <> #2 · -Rp5.000");
  });
});

describe("dossier harian / Owner 360", () => {
  it("semua shift final → status final, tanpa watermark, versi dari final shift tertinggi", () => {
    const d = buildDailyDossier(dailyInput([shift(), shift({ id: "s2", code: "SHF-2", shiftNumber: 2, finalVersion: 2 })]));
    expect(d.status).toBe("final");
    expect(d.meta.final).toBe(true);
    expect(d.meta.version).toBe(2);
    expect(d.meta.fileName).toBe("GARAGE_TEBING_TINGGI_CLOSING_2026-10-20_V02.pdf");
    expect(d.meta.reportId).toMatch(/^CLS-20261020-[0-9A-F]{8}_V02$/);
  });

  it("ringkasan memisah kurang/lebih, custody & kelengkapan jujur", () => {
    const d = buildDailyDossier(
      dailyInput(
        [
          shift({ actual: 495_000, finalStatus: "approved_with_exception" }),
          shift({ id: "s2", code: "SHF-2", shiftNumber: 2, actual: 503_000, finalStatus: "pending", qrisCounted: null }),
        ],
        {
          deposits: [
            { id: "d1", refNo: "KAS-1", cashSessionId: "s1", amount: 400_000, account: "bank_bni", depositorName: "Kasir A", at: "2026-10-20T15:10:00.000Z", confirmedAt: null, confirmedByName: null, bankRef: null },
          ],
        },
      ),
    );
    expect(d.status).toBe("pending");
    expect(d.meta.final).toBe(false);
    expect(d.summary.shortage).toBe(5_000);
    expect(d.summary.surplus).toBe(3_000);
    expect(d.summary.qrisUnchecked).toBe(1);
    expect(d.summary.depositPending).toBe(400_000);
    expect(d.summary.approval).toMatchObject({ final: 1, withException: 1, pending: 1 });
    const transit = d.custody.find((c) => c.key === "deposit_transit");
    expect(transit).toMatchObject({ amount: 400_000, holder: "Kasir A", verified: false });
    expect(d.custody.find((c) => c.key === "petty")?.amount).toBe(250_000);
    expect(d.completeness.done).toBeLessThan(d.completeness.total);
    expect(d.completeness.items.find((c) => c.label === "Setoran dikonfirmasi bank")?.ok).toBe(false);
    expect(d.strip.topExceptions[0].label).toMatch(/Selisih kas/);
    expect(d.unavailable.map((u) => u.key)).toEqual(expect.arrayContaining(["confirmed_loss", "parking", "qris_settlement"]));
  });

  it("shift berlangsung / dikembalikan / kosong", () => {
    expect(buildDailyDossier(dailyInput([])).status).toBe("empty");
    expect(buildDailyDossier(dailyInput([shift({ status: "open", actual: null, closedAt: null, finalStatus: "pending" })])).status).toBe("open");
    expect(buildDailyDossier(dailyInput([shift({ finalStatus: "returned" })])).status).toBe("returned");
  });

  it("timeline urut waktu dan memuat hitungan, tutup, setoran, keputusan final", () => {
    const d = buildDailyDossier(
      dailyInput([shift()], {
        snapshots: [{ cashSessionId: "s1", reportId: "FIN-SHF-1-V01", version: 1, decision: "approve", finalStatus: "approved", summaryHash: "h", exceptions: [], note: null, decidedByName: "Owner", decidedAt: "2026-10-20T17:00:00.000Z" }],
      }),
    );
    const kinds = d.timeline.map((t) => t.kind);
    expect(kinds[0]).toBe("open");
    expect(kinds).toEqual(expect.arrayContaining(["count", "close", "review", "final"]));
    expect([...d.timeline].map((t) => t.at)).toEqual([...d.timeline].map((t) => t.at).sort());
  });
});

describe("ledger bulanan", () => {
  const row = (overrides: Partial<MonthlyShiftRow>): MonthlyShiftRow => ({
    id: "m1",
    code: "SHF-M1",
    date: "2026-10-05",
    cashierId: "k1",
    cashierName: "Kasir A",
    status: "closed",
    openingCash: 100_000,
    expected: 500_000,
    actual: 500_000,
    recountCash: null,
    reviewerId: "m",
    reviewerName: "Manajer",
    reviewSelfVerified: false,
    countSkippedReason: null,
    finalStatus: "approved",
    hasThirdCount: false,
    cashHandled: 400_000,
    ...overrides,
  });

  it("kurang/lebih terpisah per hari & per kasir, frekuensi relatif shift sendiri", () => {
    const m = buildMonthlyLedger({
      from: "2026-10-01",
      to: "2026-10-31",
      outletName: "Tebing Tinggi",
      shifts: [
        row({ id: "a", actual: 490_000 }),
        row({ id: "b", date: "2026-10-06", actual: 505_000, hasThirdCount: true, finalStatus: "pending" }),
        row({ id: "c", cashierId: "k2", cashierName: "Kasir B", recountCash: 499_000 }),
        row({ id: "d", status: "open", actual: null }),
      ],
      alerts: [
        { riskLevel: 3, disposition: "OPEN", eventAt: "2026-10-05T10:00:00Z", ruleId: "r" },
        { riskLevel: 3, disposition: "FALSE_POSITIVE", eventAt: "2026-10-05T10:00:00Z", ruleId: "r" },
        { riskLevel: 4, disposition: "SUBSTANTIATED", eventAt: "2026-10-05T10:00:00Z", ruleId: "r" },
      ],
      cases: [
        { id: "c-old", title: "lama", status: "open", severity: "watch", createdAt: "2026-09-20T00:00:00Z", resolvedAt: null, actorName: null },
        { id: "c-new", title: "baru", status: "resolved", severity: "watch", createdAt: "2026-10-10T00:00:00Z", resolvedAt: "2026-10-12T00:00:00Z", actorName: null },
        { id: "c-dis", title: "tolak", status: "dismissed", severity: "watch", createdAt: "2026-10-11T00:00:00Z", resolvedAt: "2026-10-13T00:00:00Z", actorName: null },
      ],
      deposits: [
        { amount: 300_000, depositorName: "Kasir A", confirmedAt: "2026-10-05T12:00:00Z", at: "2026-10-05T11:00:00Z" },
        { amount: 200_000, depositorName: "Kasir A", confirmedAt: null, at: "2026-10-06T11:00:00Z" },
      ],
      tenderCorrections: 2,
      generatedAt: "2026-11-01T00:00:00Z",
    });
    expect(m.totals).toMatchObject({ shifts: 4, closedShifts: 3, shiftsWithVariance: 2, shortage: 10_000, surplus: 5_000, thirdCounts: 1, tenderCorrections: 2 });
    expect(m.totals.shortageRate).toBeCloseTo(10_000 / 1_200_000);
    const a = m.cashiers.find((c) => c.name === "Kasir A")!;
    expect(a).toMatchObject({ shifts: 2, shiftsWithVariance: 2, shortage: 10_000, surplus: 5_000, frequency: 1 });
    expect(m.cashiers.find((c) => c.name === "Kasir B")).toMatchObject({ shortage: 0, frequency: 0 });
    expect(m.reviewers[0]).toMatchObject({ reviewed: 3, recounts: 1, recountDiffers: 1 });
    expect(m.depositors[0]).toMatchObject({ amount: 500_000, unconfirmed: 200_000 });
    expect(m.risk.find((r) => r.level === 3)).toMatchObject({ total: 2, open: 1, falsePositive: 1 });
    expect(m.risk.find((r) => r.level === 4)).toMatchObject({ substantiated: 1 });
    expect(m.cases).toMatchObject({ openingBalance: 1, opened: 2, resolved: 1, dismissed: 1, closingBalance: 1 });
    expect(m.meta.final).toBe(false);
    expect(m.meta.fileName).toBe("GARAGE_TEBING_TINGGI_FINANCIAL_AUDIT_2026-10.pdf");
    expect(m.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06"]);
  });
});

describe("dossier kasus", () => {
  it("kronologi, bukti, shift terkait & status final hanya bila diputuskan", () => {
    const base = {
      id: "1a2b3c4d-0000-4000-8000-000000000000",
      title: "Selisih berulang",
      status: "open",
      severity: "warning",
      flagKind: "risk:R-REPEAT",
      actorName: "Kasir A",
      createdAt: "2026-10-10T00:00:00Z",
      resolvedAt: null,
      description: "x",
      assignedToName: null,
      createdByName: "Owner",
      notes: [{ by: "o", byName: "Owner", text: "Minta rekaman CCTV", at: "2026-10-11T00:00:00Z" }],
      updatedAt: "2026-10-11T00:00:00Z",
    };
    const alert = {
      id: "al1",
      ruleId: "R-REPEAT",
      riskLevel: 3,
      title: "Selisih berulang",
      explanation: "3 dari 5 shift berselisih",
      eventAt: "2026-10-09T00:00:00Z",
      cashSessionId: "s1",
      sessionCode: "SHF-1",
      personName: "Kasir A",
      personRole: "Kasir",
      custodyScope: "cashier",
      completeness: "complete",
      disposition: "OPEN",
      reviewerName: null,
      reviewedAt: null,
      auditCaseId: base.id,
      evidence: [{ type: "cash_session", ref: "SHF-1", label: "Shift 1" }],
    };
    const open = buildCaseDossier({
      case: base,
      alerts: [alert],
      sessions: [{ id: "s1", code: "SHF-1", cashierName: "Kasir A", date: "2026-10-09", expected: 500_000, actual: 495_000, finalStatus: "approved_with_exception", reviewStatus: "verified" }],
      outletName: "Tebing Tinggi",
      generatedAt: "2026-10-12T00:00:00Z",
    });
    expect(open.code).toBe("CASE-1A2B3C4D");
    expect(open.meta.final).toBe(false);
    expect(open.timeline.map((t) => t.label)[0]).toMatch(/alert/i);
    expect(open.evidence).toEqual([expect.objectContaining({ ref: "SHF-1", ruleId: "R-REPEAT" })]);
    expect(open.sessions[0].variance).toBe(-5_000);
    const resolved = buildCaseDossier({ case: { ...base, status: "resolved", resolvedAt: "2026-10-12T00:00:00Z" }, alerts: [], sessions: [], outletName: null, generatedAt: "x" });
    expect(resolved.meta.final).toBe(true);
  });
});
