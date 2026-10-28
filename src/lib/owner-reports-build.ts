// =============================================================================
// B7b (PRD §13.5, §16.1, §20.2) — agregasi MURNI untuk laporan resmi Owner:
//   • Dossier harian / Owner 360 (= isi PDF B "CLOSING_YYYY-MM-DD")
//   • Ledger akuntabilitas bulanan (= isi PDF C "FINANCIAL_AUDIT_YYYY-MM")
//   • Dossier kasus (= isi PDF D "CASE_<ID>")
// Tanpa akses DB (pemuat ada di owner-reports.ts) supaya bisa dites & dipakai UI.
// Aturan PRD yang dijaga di sini:
//   - kurang (shortage) & lebih (surplus) TIDAK PERNAH dinetkan;
//   - data yang belum tercatat di sistem diberi status "unavailable", bukan 0;
//   - alert risiko = prioritas pemeriksaan, bukan vonis (kata-kata netral);
//   - total & status dari snapshot/ledger, bukan narasi.
// =============================================================================
import { createHash } from "node:crypto";

export const FINAL_STATUSES = ["approved", "approved_with_exception"] as const;
export const isFinalStatus = (status: string | null | undefined) => status === "approved" || status === "approved_with_exception";

/** Metrik PRD yang datanya belum ada di sistem — tampil sebagai "belum tercatat", tidak sebagai 0. */
export const UNAVAILABLE_METRICS: Array<{ key: string; label: string; reason: string }> = [
  { key: "confirmed_loss", label: "Kerugian terbukti (confirmed loss)", reason: "Keputusan kasus belum mencatat nominal kerugian." },
  { key: "recovered", label: "Pengembalian diterima (recovered)", reason: "Belum ada pencatatan penggantian uang per kasus." },
  { key: "payroll_review", label: "Menunggu review payroll", reason: "Otorisasi potongan gaji adalah proses terpisah (PRD §13.5) dan belum dibangun." },
  { key: "parking", label: "Kepatuhan setoran parkir", reason: "Deklarasi parkir per tanggal menunggu keputusan Owner (D-06, batch B2)." },
  { key: "qris_settlement", label: "QRIS settled dari provider", reason: "QRIS statis — status settled dari provider belum tersedia (D-06)." },
];

// ── Bentuk data masukan (diisi pemuat DB) ───────────────────────────────────

export type DossierShiftInput = {
  id: string;
  code: string;
  shiftNumber: number;
  cashierName: string | null;
  openedAt: string;
  closedAt: string | null;
  status: string;
  openingCash: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashRefundsVoids: number;
  financeCashOut: number;
  methodCorrections: number;
  otherAdjustments: number;
  expected: number;
  /** Hitungan sah kasir (#1, atau #3 bila #1 ≠ #2). */
  actual: number | null;
  recountCash: number | null;
  floatLeft: number | null;
  deposit: number | null;
  grossSales: number;
  netSales: number;
  paidCount: number;
  voidCount: number;
  refundTotal: number;
  qris: number;
  transfer: number;
  otherNonCash: number;
  qrisRecorded: number | null;
  qrisCounted: number | null;
  qrisDiscrepancy: number | null;
  reviewStatus: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewSelfVerified: boolean;
  discrepancyAcknowledged: boolean;
  countSkippedReason: string | null;
  finalStatus: string;
  finalVersion: number;
  finalReportId: string | null;
  finalSummaryHash: string | null;
  finalDecidedByName: string | null;
  finalDecidedAt: string | null;
  finalNote: string | null;
  counts: Array<{ kind: string; total: number; at: string; countedByName: string | null }>;
  incidents: Array<{ status: string; category: string; description: string; at: string }>;
  /** Peristiwa shift untuk timeline (void/refund/koreksi, mutasi kas). */
  events: Array<{ at: string; kind: string; label: string; amount: number | null; ref: string | null; by: string | null }>;
};

export type DossierAlertInput = {
  id: string;
  ruleId: string;
  riskLevel: number;
  title: string;
  explanation: string;
  eventAt: string;
  cashSessionId: string | null;
  sessionCode: string | null;
  personName: string | null;
  personRole: string | null;
  custodyScope: string;
  completeness: string;
  disposition: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  auditCaseId: string | null;
  evidence: Array<{ type: string; ref: string; label: string }>;
};

export type DossierCaseInput = {
  id: string;
  title: string;
  status: string;
  severity: string;
  flagKind: string;
  actorName: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type DossierDepositInput = {
  id: string;
  refNo: string | null;
  cashSessionId: string | null;
  amount: number;
  account: string | null;
  depositorName: string | null;
  at: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
  bankRef: string | null;
};

export type DossierSnapshotInput = {
  cashSessionId: string;
  reportId: string;
  version: number;
  decision: string;
  finalStatus: string;
  summaryHash: string;
  exceptions: string[];
  note: string | null;
  decidedByName: string | null;
  decidedAt: string;
};

export type MonthToDate = {
  from: string;
  to: string;
  shifts: number;
  shiftsWithVariance: number;
  shortage: number;
  surplus: number;
  openCases: number;
};

export type DailyDossierInput = {
  date: string;
  outletName: string | null;
  shifts: DossierShiftInput[];
  alerts: DossierAlertInput[];
  cases: DossierCaseInput[];
  deposits: DossierDepositInput[];
  snapshots: DossierSnapshotInput[];
  pettyClosingBalance: number | null;
  monthToDate: MonthToDate | null;
  generatedAt: string;
};

// ── Helper ──────────────────────────────────────────────────────────────────

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

/** Selisih shift: hitungan sah kasir − kas seharusnya (null = belum dihitung). */
export function shiftVariance(shift: Pick<DossierShiftInput, "actual" | "expected">) {
  return shift.actual === null ? null : shift.actual - shift.expected;
}

/** Kurang & lebih dipisah (PRD §16.1: tidak dinetkan). */
export function splitVariance(variances: Array<number | null>) {
  return {
    shortage: sum(variances.filter((v): v is number => v !== null && v < 0).map((v) => -v)),
    surplus: sum(variances.filter((v): v is number => v !== null && v > 0)),
  };
}

function countTotal(shift: DossierShiftInput, kind: string) {
  const rows = shift.counts.filter((count) => count.kind === kind);
  return rows.length ? rows[rows.length - 1].total : null;
}

/** Pengecualian shift (bahasa netral; dasar "approve with exception"). */
export function shiftExceptions(shift: DossierShiftInput) {
  const out: string[] = [];
  const variance = shiftVariance(shift);
  if (shift.status === "open") out.push("Shift masih berlangsung");
  if (variance !== null && variance !== 0) out.push(`Selisih kas ${variance > 0 ? "+" : "−"}Rp${Math.abs(variance).toLocaleString("id-ID")}`);
  const c1 = countTotal(shift, "count_1");
  const c2 = countTotal(shift, "count_2");
  // #1 ≠ #2 dinilai per pecahan (total bisa sama) — tandanya hitungan #3 tercatat.
  if (countTotal(shift, "count_3") !== null || (c1 !== null && c2 !== null && c1 !== c2)) out.push("Hitungan #1 ≠ #2 (dipakai hitungan #3)");
  if (shift.recountCash !== null && shift.actual !== null && shift.recountCash !== shift.actual) out.push("Hitung ulang pemeriksa berbeda dari hitungan kasir");
  if (shift.countSkippedReason) out.push("Tutup darurat tanpa hitungan pecahan");
  if (shift.reviewSelfVerified) out.push("Diverifikasi tanpa pemeriksa kedua");
  if (shift.qrisDiscrepancy !== null && shift.qrisDiscrepancy !== 0) out.push("QRIS tercatat ≠ QRIS dicocokkan");
  const openIncidents = shift.incidents.filter((incident) => incident.status !== "resolved").length;
  if (openIncidents) out.push(`${openIncidents} insiden belum selesai`);
  return out;
}

export function summaryHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Revisi sah → `_V02`, `_V03` (PRD §20.2). Versi dokumen harian = versi final shift tertinggi. */
export function versionSuffix(version: number) {
  return version >= 2 ? `_V${String(version).padStart(2, "0")}` : "";
}

export function outletSlug(name: string | null | undefined) {
  return (
    (name ?? "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "_")
      .toUpperCase() || "OUTLET"
  );
}

/** PRD §20.2 jenis B. */
export function officialClosingFileName(params: { outletName?: string | null; date: string; version: number }) {
  return `GARAGE_${outletSlug(params.outletName)}_CLOSING_${params.date}${versionSuffix(params.version)}.pdf`;
}

/** PRD §20.2 jenis C. */
export function officialMonthlyFileName(params: { outletName?: string | null; month: string }) {
  return `GARAGE_${outletSlug(params.outletName)}_FINANCIAL_AUDIT_${params.month}.pdf`;
}

/** Kode kasus yang dibaca manusia (audit_cases tidak punya nomor) = 8 karakter awal UUID. */
export function caseCode(id: string) {
  return `CASE-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** PRD §20.2 jenis D. */
export function officialCaseFileName(params: { outletName?: string | null; caseId: string }) {
  return `GARAGE_${outletSlug(params.outletName)}_CASE_${caseCode(params.caseId)}.pdf`;
}

// ── Dossier harian / Owner 360 (PRD §13.5 + §20.2 B) ─────────────────────────

export type DailyStatus = "empty" | "open" | "pending" | "returned" | "final";

export const DAILY_STATUS_LABEL: Record<DailyStatus, string> = {
  empty: "Tidak ada shift",
  open: "Masih ada shift berlangsung",
  pending: "Menunggu final Owner",
  returned: "Ada shift dikembalikan untuk koreksi",
  final: "Semua shift final Owner",
};

export function buildDailyDossier(input: DailyDossierInput) {
  const shifts = input.shifts.map((shift) => {
    const variance = shiftVariance(shift);
    const c1 = countTotal(shift, "count_1");
    const c2 = countTotal(shift, "count_2");
    return {
      ...shift,
      variance,
      count1: c1,
      count2: c2,
      count3: countTotal(shift, "count_3"),
      count1vs2: c1 !== null && c2 !== null ? c2 - c1 : null,
      recountVariance: shift.recountCash === null ? null : shift.recountCash - shift.expected,
      exceptions: shiftExceptions(shift),
      final: isFinalStatus(shift.finalStatus),
    };
  });

  const status: DailyStatus = !shifts.length
    ? "empty"
    : shifts.some((s) => s.status === "open")
      ? "open"
      : shifts.some((s) => s.finalStatus === "returned")
        ? "returned"
        : shifts.every((s) => s.final)
          ? "final"
          : "pending";

  const { shortage, surplus } = splitVariance(shifts.map((s) => s.variance));
  const depositsPending = input.deposits.filter((d) => !d.confirmedAt);
  const depositsConfirmed = input.deposits.filter((d) => d.confirmedAt);
  const openAlerts = input.alerts.filter((a) => a.disposition === "OPEN");
  const openCases = input.cases.filter((c) => c.status === "open" || c.status === "investigating");

  const moneyIn = sum(shifts.map((s) => s.cashSales + s.cashIn + s.qris + s.transfer + s.otherNonCash));
  const moneyOut = sum(shifts.map((s) => s.cashOut + s.cashRefundsVoids + s.financeCashOut));

  // 3 pengecualian terbesar: nilai selisih terbesar dulu, lalu jumlah pengecualian.
  const topExceptions = shifts
    .flatMap((s) => s.exceptions.map((label) => ({ shiftCode: s.code, cashierName: s.cashierName, label, weight: Math.abs(s.variance ?? 0) })))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const summary = {
    grossSales: sum(shifts.map((s) => s.grossSales)),
    netSales: sum(shifts.map((s) => s.netSales)),
    paidCount: sum(shifts.map((s) => s.paidCount)),
    voidCount: sum(shifts.map((s) => s.voidCount)),
    refundTotal: sum(shifts.map((s) => s.refundTotal)),
    cashSales: sum(shifts.map((s) => s.cashSales)),
    qris: sum(shifts.map((s) => s.qris)),
    transfer: sum(shifts.map((s) => s.transfer)),
    otherNonCash: sum(shifts.map((s) => s.otherNonCash)),
    // Shift tanpa QRIS tidak perlu dicocokkan (sama dengan pemeriksaan kelengkapan).
    qrisUnchecked: shifts.filter((s) => s.status === "closed" && s.qris > 0 && s.qrisCounted === null).length,
    qrisMismatch: sum(shifts.map((s) => Math.abs(s.qrisDiscrepancy ?? 0))),
    expected: sum(shifts.map((s) => s.expected)),
    actual: shifts.some((s) => s.actual !== null) ? sum(shifts.map((s) => s.actual ?? 0)) : null,
    shortage,
    surplus,
    depositTotal: sum(input.deposits.map((d) => d.amount)),
    depositPending: sum(depositsPending.map((d) => d.amount)),
    openAlerts: openAlerts.length,
    openCases: openCases.length,
    approval: {
      final: shifts.filter((s) => s.final).length,
      withException: shifts.filter((s) => s.finalStatus === "approved_with_exception").length,
      pending: shifts.filter((s) => s.finalStatus === "pending").length,
      returned: shifts.filter((s) => s.finalStatus === "returned").length,
      legacy: shifts.filter((s) => s.finalStatus === "legacy").length,
    },
  };

  // Custody map (PRD §13.5 P0): di mana uangnya & siapa pemegangnya.
  const openShifts = shifts.filter((s) => s.status === "open");
  const lastClosed = [...shifts].reverse().find((s) => s.status === "closed");
  const custody = [
    {
      key: "drawer",
      label: "Laci kasir (shift berlangsung)",
      amount: openShifts.length ? sum(openShifts.map((s) => s.expected)) : 0,
      holder: openShifts.map((s) => s.cashierName ?? "-").join(", ") || "-",
      note: openShifts.length ? "Saldo seharusnya; dihitung saat tutup shift" : "Tidak ada shift berlangsung",
      verified: openShifts.length === 0,
    },
    {
      key: "float",
      label: "Modal ditinggal untuk shift berikutnya",
      amount: lastClosed?.floatLeft ?? 0,
      holder: lastClosed?.cashierName ?? "-",
      note: lastClosed ? `Dari tutup shift ${lastClosed.code}` : "-",
      verified: lastClosed?.floatLeft !== null && lastClosed?.floatLeft !== undefined,
    },
    {
      key: "deposit_transit",
      label: "Setoran dalam perjalanan (belum dikonfirmasi bank)",
      amount: summary.depositPending,
      holder: Array.from(new Set(depositsPending.map((d) => d.depositorName ?? "-"))).join(", ") || "-",
      note: depositsPending.length ? `${depositsPending.length} setoran menunggu konfirmasi penerima` : "Tidak ada setoran yang menunggu konfirmasi",
      verified: depositsPending.length === 0,
    },
    {
      key: "bank",
      label: "Setoran diterima di rekening",
      amount: sum(depositsConfirmed.map((d) => d.amount)),
      holder: Array.from(new Set(depositsConfirmed.map((d) => d.account ?? "-"))).join(", ") || "-",
      note: depositsConfirmed.length ? "Dikonfirmasi dengan nomor bukti bank" : "-",
      verified: true,
    },
    {
      key: "petty",
      label: "Petty cash (dana terpisah, akhir hari)",
      amount: input.pettyClosingBalance ?? 0,
      holder: "Dana petty outlet",
      note: input.pettyClosingBalance === null ? "Tidak terbaca" : "Saldo buku kas akun petty",
      verified: input.pettyClosingBalance !== null,
    },
    {
      key: "safe",
      label: "Brankas",
      amount: 0,
      holder: "-",
      note: "Tidak dipakai (keputusan Owner 25 Okt 2026: setoran langsung ke rekening)",
      verified: true,
    },
  ];

  // Penjelasan selisih per shift (PRD §13.5 P0 Variance Explanation).
  const variance = shifts.map((s) => ({
    shiftCode: s.code,
    shiftNumber: s.shiftNumber,
    cashierName: s.cashierName,
    openingCash: s.openingCash,
    cashSales: s.cashSales,
    cashIn: s.cashIn,
    cashOut: s.cashOut,
    cashRefundsVoids: s.cashRefundsVoids,
    financeCashOut: s.financeCashOut,
    methodCorrections: s.methodCorrections,
    otherAdjustments: s.otherAdjustments,
    expected: s.expected,
    actual: s.actual,
    variance: s.variance,
    count1vs2: s.count1vs2,
    recountVariance: s.recountVariance,
    deposit: s.deposit,
  }));

  // Timeline WIB (PRD §13.5 P1).
  const timeline = [
    ...shifts.flatMap((s) => [
      { at: s.openedAt, kind: "open", label: `Buka shift ${s.code}`, by: s.cashierName, amount: s.openingCash as number | null, ref: s.code },
      ...s.counts.map((count) => ({ at: count.at, kind: "count", label: `${COUNT_KIND_LABEL[count.kind] ?? count.kind} · ${s.code}`, by: count.countedByName, amount: count.total as number | null, ref: s.code })),
      ...(s.closedAt ? [{ at: s.closedAt, kind: "close", label: `Tutup shift ${s.code}`, by: s.cashierName, amount: s.actual, ref: s.code }] : []),
      ...(s.reviewedAt ? [{ at: s.reviewedAt, kind: "review", label: `Pemeriksaan Manajer ${s.code}: ${s.reviewStatus}`, by: s.reviewedByName, amount: null, ref: s.code }] : []),
      ...s.events.map((event) => ({ at: event.at, kind: event.kind, label: `${event.label} · ${s.code}`, by: event.by, amount: event.amount, ref: event.ref ?? s.code })),
    ]),
    ...input.deposits.flatMap((d) => [
      { at: d.at, kind: "deposit", label: `Setoran ${d.refNo ?? ""} → ${d.account ?? "-"}`.trim(), by: d.depositorName, amount: d.amount as number | null, ref: d.refNo },
      ...(d.confirmedAt ? [{ at: d.confirmedAt, kind: "deposit_confirm", label: `Setoran diterima bank (${d.bankRef ?? "-"})`, by: d.confirmedByName, amount: d.amount as number | null, ref: d.refNo }] : []),
    ]),
    ...input.alerts.map((a) => ({ at: a.eventAt, kind: "alert", label: `Alert LV${a.riskLevel}: ${a.title}`, by: null, amount: null, ref: a.ruleId })),
    ...input.snapshots.map((snap) => ({ at: snap.decidedAt, kind: "final", label: `Keputusan final Owner ${snap.reportId}: ${snap.finalStatus}`, by: snap.decidedByName, amount: null, ref: snap.reportId })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // Kelengkapan data (PRD §13.5 guardrail "16/18 dokumen").
  const checks = shifts.flatMap((s) =>
    s.status === "open"
      ? []
      : [
          { shiftCode: s.code, label: "Hitungan pecahan saat tutup", ok: !s.countSkippedReason && s.actual !== null },
          { shiftCode: s.code, label: "Hitung ulang #2 (blind)", ok: s.count2 !== null || s.finalStatus === "legacy" },
          { shiftCode: s.code, label: "Pemeriksaan Manajer", ok: s.reviewStatus === "verified" },
          { shiftCode: s.code, label: "QRIS dicocokkan", ok: s.qrisCounted !== null || s.qris === 0 },
          { shiftCode: s.code, label: "Final Owner (2FA)", ok: s.final },
        ],
  );
  const depositChecks = input.deposits.map((d) => ({ shiftCode: d.refNo ?? "-", label: "Setoran dikonfirmasi bank", ok: Boolean(d.confirmedAt) }));
  const completenessItems = [...checks, ...depositChecks];
  const completeness = { done: completenessItems.filter((c) => c.ok).length, total: completenessItems.length, items: completenessItems };

  const version = Math.max(1, ...shifts.map((s) => s.finalVersion || 1));
  const hashBasis = {
    date: input.date,
    shifts: shifts.map((s) => ({ code: s.code, expected: s.expected, actual: s.actual, finalStatus: s.finalStatus, finalSummaryHash: s.finalSummaryHash })),
    deposits: input.deposits.map((d) => ({ id: d.id, amount: d.amount, confirmed: Boolean(d.confirmedAt) })),
    alerts: input.alerts.map((a) => ({ id: a.id, disposition: a.disposition })),
  };
  const hash = summaryHash(hashBasis);
  const meta = {
    reportId: `CLS-${input.date.replace(/-/g, "")}-${hash.slice(0, 8).toUpperCase()}${versionSuffix(version)}`,
    hash,
    version,
    final: status === "final",
    generatedAt: input.generatedAt,
    fileName: officialClosingFileName({ outletName: input.outletName, date: input.date, version }),
  };

  return {
    date: input.date,
    outletName: input.outletName,
    status,
    statusLabel: DAILY_STATUS_LABEL[status],
    strip: { shiftCount: shifts.length, moneyIn, moneyOut, topExceptions },
    summary,
    custody,
    variance,
    shifts,
    alerts: input.alerts,
    cases: input.cases,
    deposits: input.deposits,
    snapshots: input.snapshots,
    timeline,
    completeness,
    monthToDate: input.monthToDate,
    unavailable: UNAVAILABLE_METRICS,
    meta,
  };
}

export type DailyDossier = ReturnType<typeof buildDailyDossier>;

export const COUNT_KIND_LABEL: Record<string, string> = {
  count_1: "Hitungan #1 kasir",
  count_2: "Hitung ulang #2 (blind)",
  count_3: "Hitungan #3 (dipakai)",
  manager_recount: "Hitung ulang pemeriksa",
};

// ── Ledger akuntabilitas bulanan (PRD §16.1 + §20.2 C) ───────────────────────

export type MonthlyShiftRow = {
  id: string;
  code: string;
  date: string;
  cashierId: string | null;
  cashierName: string | null;
  status: string;
  openingCash: number;
  expected: number;
  actual: number | null;
  recountCash: number | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewSelfVerified: boolean;
  countSkippedReason: string | null;
  finalStatus: string;
  hasThirdCount: boolean;
  /** Uang tunai yang masuk laci selama shift (buku kas; format lama: kas seharusnya − modal). */
  cashHandled: number;
};

export type MonthlyAlertRow = { riskLevel: number; disposition: string; eventAt: string; ruleId: string };
export type MonthlyCaseRow = { id: string; title: string; status: string; severity: string; createdAt: string; resolvedAt: string | null; actorName: string | null };
export type MonthlyDepositRow = { amount: number; depositorName: string | null; confirmedAt: string | null; at: string };

export type MonthlyLedgerInput = {
  from: string;
  to: string;
  outletName: string | null;
  shifts: MonthlyShiftRow[];
  alerts: MonthlyAlertRow[];
  cases: MonthlyCaseRow[];
  deposits: MonthlyDepositRow[];
  tenderCorrections: number;
  generatedAt: string;
};

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function buildMonthlyLedger(input: MonthlyLedgerInput) {
  const closed = input.shifts.filter((s) => s.status === "closed");
  const withVariance = (rows: MonthlyShiftRow[]) => rows.filter((s) => s.actual !== null && s.actual !== s.expected);
  const variances = (rows: MonthlyShiftRow[]) => splitVariance(rows.map((s) => (s.actual === null ? null : s.actual - s.expected)));

  const totalsSplit = variances(closed);
  const cashHandled = sum(closed.map((s) => s.cashHandled));
  const totals = {
    shifts: input.shifts.length,
    closedShifts: closed.length,
    shiftsWithVariance: withVariance(closed).length,
    varianceFrequency: ratio(withVariance(closed).length, closed.length),
    shortage: totalsSplit.shortage,
    surplus: totalsSplit.surplus,
    cashHandled,
    shortageRate: ratio(totalsSplit.shortage, cashHandled),
    thirdCounts: closed.filter((s) => s.hasThirdCount).length,
    emergencyCloses: closed.filter((s) => s.countSkippedReason).length,
    selfVerified: closed.filter((s) => s.reviewSelfVerified).length,
    tenderCorrections: input.tenderCorrections,
    finals: {
      approved: closed.filter((s) => s.finalStatus === "approved").length,
      withException: closed.filter((s) => s.finalStatus === "approved_with_exception").length,
      pending: closed.filter((s) => s.finalStatus === "pending").length,
      returned: closed.filter((s) => s.finalStatus === "returned").length,
      legacy: closed.filter((s) => s.finalStatus === "legacy").length,
    },
  };

  const days = Array.from(new Set(closed.map((s) => s.date)))
    .sort()
    .map((date) => {
      const rows = closed.filter((s) => s.date === date);
      const split = variances(rows);
      return {
        date,
        shifts: rows.length,
        expected: sum(rows.map((s) => s.expected)),
        actual: sum(rows.map((s) => s.actual ?? 0)),
        shortage: split.shortage,
        surplus: split.surplus,
        final: rows.filter((s) => isFinalStatus(s.finalStatus)).length,
      };
    });

  // Per kasir: frekuensi relatif terhadap shift-nya sendiri & kas yang ditangani
  // (PRD §16.1: tidak membandingkan pegawai dengan volume kerja berbeda secara mentah).
  const cashierKeys = Array.from(new Set(closed.map((s) => s.cashierId ?? s.cashierName ?? "-")));
  const cashiers = cashierKeys
    .map((key) => {
      const rows = closed.filter((s) => (s.cashierId ?? s.cashierName ?? "-") === key);
      const split = variances(rows);
      const handled = sum(rows.map((s) => s.cashHandled));
      return {
        name: rows[0]?.cashierName ?? "-",
        shifts: rows.length,
        shiftsWithVariance: withVariance(rows).length,
        frequency: ratio(withVariance(rows).length, rows.length),
        shortage: split.shortage,
        surplus: split.surplus,
        cashHandled: handled,
        shortageRate: ratio(split.shortage, handled),
        thirdCounts: rows.filter((s) => s.hasThirdCount).length,
        emergencyCloses: rows.filter((s) => s.countSkippedReason).length,
      };
    })
    .sort((a, b) => b.shortage - a.shortage || a.name.localeCompare(b.name));

  // Pemeriksa/manajer: dipisah dari kasir (PRD §16.1 "Manager custody variance").
  const reviewerKeys = Array.from(new Set(closed.filter((s) => s.reviewerId).map((s) => s.reviewerId as string)));
  const depositorNames = Array.from(new Set(input.deposits.map((d) => d.depositorName ?? "-")));
  const reviewers = reviewerKeys.map((key) => {
    const rows = closed.filter((s) => s.reviewerId === key);
    const recounted = rows.filter((s) => s.recountCash !== null);
    return {
      name: rows[0]?.reviewerName ?? "-",
      reviewed: rows.length,
      recounts: recounted.length,
      recountDiffers: recounted.filter((s) => s.recountCash !== s.actual).length,
      selfVerified: rows.filter((s) => s.reviewSelfVerified).length,
    };
  });
  const depositors = depositorNames.map((name) => {
    const rows = input.deposits.filter((d) => (d.depositorName ?? "-") === name);
    return {
      name,
      deposits: rows.length,
      amount: sum(rows.map((d) => d.amount)),
      unconfirmed: sum(rows.filter((d) => !d.confirmedAt).map((d) => d.amount)),
    };
  });

  // Risiko per LV + disposisi (true positive = Terbukti, false positive = Bukan masalah).
  const risk = [1, 2, 3, 4, 5].map((level) => {
    const rows = input.alerts.filter((a) => a.riskLevel === level);
    return {
      level,
      total: rows.length,
      open: rows.filter((a) => a.disposition === "OPEN").length,
      substantiated: rows.filter((a) => a.disposition === "SUBSTANTIATED").length,
      falsePositive: rows.filter((a) => a.disposition === "FALSE_POSITIVE").length,
      explained: rows.filter((a) => a.disposition === "EXPLAINED" || a.disposition === "CLOSED").length,
      disputed: rows.filter((a) => a.disposition === "DISPUTED").length,
    };
  });

  // Roll-forward kasus: awal + baru − selesai = akhir (PRD §16.1).
  const start = new Date(`${input.from}T00:00:00+07:00`).getTime();
  const end = new Date(`${input.to}T00:00:00+07:00`).getTime() + 86_400_000;
  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const openAt = (c: MonthlyCaseRow, t: number) => at(c.createdAt)! < t && (at(c.resolvedAt) === null || at(c.resolvedAt)! >= t);
  const cases = {
    openingBalance: input.cases.filter((c) => openAt(c, start)).length,
    opened: input.cases.filter((c) => at(c.createdAt)! >= start && at(c.createdAt)! < end).length,
    resolved: input.cases.filter((c) => c.status === "resolved" && at(c.resolvedAt) !== null && at(c.resolvedAt)! >= start && at(c.resolvedAt)! < end).length,
    dismissed: input.cases.filter((c) => c.status === "dismissed" && at(c.resolvedAt) !== null && at(c.resolvedAt)! >= start && at(c.resolvedAt)! < end).length,
    closingBalance: input.cases.filter((c) => openAt(c, end)).length,
    list: input.cases.filter((c) => at(c.createdAt)! < end && (at(c.resolvedAt) === null || at(c.resolvedAt)! >= start)),
  };

  const month = input.from.slice(0, 7);
  const hash = summaryHash({ from: input.from, to: input.to, totals, days, cases: { ...cases, list: cases.list.map((c) => c.id) } });
  return {
    from: input.from,
    to: input.to,
    month,
    outletName: input.outletName,
    totals,
    days,
    cashiers,
    reviewers,
    depositors,
    risk,
    cases,
    unavailable: UNAVAILABLE_METRICS,
    meta: {
      reportId: `AUD-${input.from.replace(/-/g, "")}-${input.to.replace(/-/g, "")}-${hash.slice(0, 8).toUpperCase()}`,
      hash,
      generatedAt: input.generatedAt,
      // Final bila semua shift tertutup sudah final Owner (shift legacy dihitung sudah tertutup sebelum B4).
      final: closed.length > 0 && closed.every((s) => isFinalStatus(s.finalStatus) || s.finalStatus === "legacy") && closed.length === input.shifts.length,
      fileName: officialMonthlyFileName({ outletName: input.outletName, month }),
    },
  };
}

export type MonthlyLedger = ReturnType<typeof buildMonthlyLedger>;

export function monthToDateOf(ledger: MonthlyLedger, openCases: number): MonthToDate {
  return {
    from: ledger.from,
    to: ledger.to,
    shifts: ledger.totals.closedShifts,
    shiftsWithVariance: ledger.totals.shiftsWithVariance,
    shortage: ledger.totals.shortage,
    surplus: ledger.totals.surplus,
    openCases,
  };
}

// ── Dossier kasus (PRD §20.2 D) ──────────────────────────────────────────────

export const CASE_STATUS_LABEL: Record<string, string> = {
  open: "Terbuka — belum ada kesimpulan",
  investigating: "Sedang diperiksa",
  resolved: "Selesai (diputuskan)",
  dismissed: "Ditutup — tidak terbukti / bukan masalah",
};

export type CaseDossierInput = {
  case: DossierCaseInput & {
    description: string | null;
    assignedToName: string | null;
    createdByName: string | null;
    notes: Array<{ by: string; byName: string; text: string; at: string }>;
    updatedAt: string;
  };
  alerts: DossierAlertInput[];
  sessions: Array<{ id: string; code: string; cashierName: string | null; date: string; expected: number; actual: number | null; finalStatus: string; reviewStatus: string }>;
  outletName: string | null;
  generatedAt: string;
};

export function buildCaseDossier(input: CaseDossierInput) {
  const c = input.case;
  const timeline = [
    { at: c.createdAt, label: "Kasus dibuka", by: c.createdByName },
    ...input.alerts.map((a) => ({ at: a.eventAt, label: `Peristiwa alert LV${a.riskLevel}: ${a.title}`, by: null as string | null })),
    ...input.alerts.filter((a) => a.reviewedAt).map((a) => ({ at: a.reviewedAt as string, label: `Disposisi alert: ${a.disposition}`, by: a.reviewerName })),
    ...c.notes.map((note) => ({ at: note.at, label: `Catatan: ${note.text}`, by: note.byName })),
    ...(c.resolvedAt ? [{ at: c.resolvedAt, label: `Status akhir: ${CASE_STATUS_LABEL[c.status] ?? c.status}`, by: null as string | null }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const evidence = input.alerts.flatMap((a) => a.evidence.map((e) => ({ ...e, alertId: a.id, ruleId: a.ruleId })));
  const sessions = input.sessions.map((s) => ({ ...s, variance: s.actual === null ? null : s.actual - s.expected }));
  const hash = summaryHash({ id: c.id, status: c.status, notes: c.notes.length, alerts: input.alerts.map((a) => [a.id, a.disposition]) });
  return {
    code: caseCode(c.id),
    case: { ...c, statusLabel: CASE_STATUS_LABEL[c.status] ?? c.status },
    timeline,
    evidence,
    alerts: input.alerts,
    sessions,
    meta: {
      reportId: `${caseCode(c.id)}-${hash.slice(0, 8).toUpperCase()}`,
      hash,
      generatedAt: input.generatedAt,
      final: c.status === "resolved" || c.status === "dismissed",
      fileName: officialCaseFileName({ outletName: input.outletName, caseId: c.id }),
    },
  };
}

export type CaseDossier = ReturnType<typeof buildCaseDossier>;
