// =============================================================================
// B6 (PRD §14): aturan risiko explainable LV1–LV5. Fungsi murni — tanpa DB.
// - Level = PRIORITAS PEMERIKSAAN, bukan kepastian. Bahasa netral: "peristiwa terkait",
//   tidak pernah "mencuri"/"curang". Tidak ada peringkat pegawai.
// - Setiap alert membawa aturan + versi, bukti (shift/transaksi), kelengkapan bukti, dan
//   cakupan custody (PRD §14.5): selisih QRIS bukan tanggung jawab laci kasir, setoran
//   belum dikonfirmasi = rekonsiliasi bank.
// - Aturan berulang memakai pembanding jumlah shift (denominator), bukan angka mentah.
// =============================================================================

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type CustodyScope = "cashier" | "manager" | "qris" | "bank" | "system";
export type RiskDisposition = "OPEN" | "FALSE_POSITIVE" | "EXPLAINED" | "SUBSTANTIATED" | "DISPUTED" | "CLOSED";

export const RISK_DISPOSITIONS: RiskDisposition[] = ["OPEN", "FALSE_POSITIVE", "EXPLAINED", "SUBSTANTIATED", "DISPUTED", "CLOSED"];

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  1: "LV1 · Info",
  2: "LV2 · Rendah",
  3: "LV3 · Sedang",
  4: "LV4 · Tinggi",
  5: "LV5 · Kritis",
};

export const RISK_DISPOSITION_LABEL: Record<RiskDisposition, string> = {
  OPEN: "Terbuka",
  FALSE_POSITIVE: "Bukan masalah (false positive)",
  EXPLAINED: "Sudah dijelaskan",
  SUBSTANTIATED: "Terbukti (berdasarkan bukti)",
  DISPUTED: "Disanggah",
  CLOSED: "Ditutup",
};

/** Ambang selisih kecil (sama dengan status "minor" closing). */
export const MINOR_DISCREPANCY = 10_000;
export const REPEAT_WINDOW_DAYS = 30;
const REFUND_VOID_MANY = 3;
const METHOD_FIX_MANY = 2;
/** Kas keluar langsung (tanpa ACC) per shift: banyak transaksi, atau total ≥ 80% batas shift. */
const CASH_OUT_DIRECT_MANY = 5;
const CASH_OUT_DIRECT_NEAR_LIMIT = 0.8;
const DEPOSIT_UNCONFIRMED_HOURS = 24;

export type RiskSessionFacts = {
  sessionId: string;
  code: string;
  outletId: string | null;
  businessDate: string;
  closedAt: Date;
  cashierId: string | null;
  cashierName: string | null;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  /** Saldo laci menurut buku kas (null = shift format lama). */
  ledgerBalance: number | null;
  countSkippedReason: string | null;
  qrisDiscrepancy: number | null;
  reviewSelfVerified: boolean;
  reviewedBy: string | null;
  countKinds: string[];
  refundVoidCount: number;
  methodFixCount: number;
  unconfirmedDeposits: Array<{ id: string; amount: number; recordedAt: Date; ref: string }>;
  /** Owner 6 Nov 2026: kas keluar kasir yang langsung tercatat tanpa ACC (bukan setoran). Opsional (data lama). */
  cashOutDirect?: { count: number; total: number; withoutReceipt: number; limit: number };
  /** Riwayat kasir yang sama dalam REPEAT_WINDOW_DAYS (termasuk shift ini). */
  history: { shifts: number; shortageShifts: number; mismatchShifts: number };
  /** shiftDiscrepancyThreshold dari Pengaturan. */
  threshold: number;
  now: Date;
};

export type RiskAlertDraft = {
  dedupeKey: string;
  ruleId: string;
  ruleVersion: number;
  riskLevel: RiskLevel;
  title: string;
  explanation: string;
  eventAt: Date;
  custodyScope: CustodyScope;
  personUserId: string | null;
  personRole: string | null;
  evidence: Array<{ type: string; ref: string; label: string }>;
  completeness: "complete" | "partial";
};

const rp = (value: number) => `Rp${Math.abs(value).toLocaleString("id-ID")}`;

/** Evaluasi semua aturan untuk satu shift yang sudah ditutup. */
export function evaluateSessionRisk(f: RiskSessionFacts): RiskAlertDraft[] {
  const alerts: RiskAlertDraft[] = [];
  const shift = { type: "cash_session", ref: f.sessionId, label: `Shift ${f.code} · ${f.businessDate}` };
  const cashier = { custodyScope: "cashier" as const, personUserId: f.cashierId, personRole: "Kasir" };
  const base = (ruleId: string, suffix = f.sessionId) => ({ ruleId, ruleVersion: 1, dedupeKey: `${ruleId}:${suffix}`, eventAt: f.closedAt });
  const status = "Status: perlu diperiksa — belum ada kesimpulan.";

  if (f.discrepancy < 0) {
    const amount = -f.discrepancy;
    alerts.push({
      ...base("CASH_SHORTAGE"),
      ...cashier,
      riskLevel: amount <= MINOR_DISCREPANCY ? 2 : amount <= f.threshold ? 3 : 4,
      title: `Kas laci kurang ${rp(amount)}`,
      explanation: `Peristiwa terkait shift ${f.code}: kas dihitung ${rp(f.actualCash ?? 0)}, kas seharusnya ${rp(f.expectedCash)}. Kemungkinan penyebab: salah hitung, kas keluar belum dicatat, salah metode bayar. ${status}`,
      evidence: [shift],
      completeness: f.countKinds.length ? "complete" : "partial",
    });
  }
  if (f.discrepancy > 0) {
    alerts.push({
      ...base("CASH_SURPLUS"),
      ...cashier,
      riskLevel: f.discrepancy > f.threshold ? 3 : 2,
      title: `Kas laci lebih ${rp(f.discrepancy)}`,
      explanation: `Peristiwa terkait shift ${f.code}: kas dihitung melebihi kas seharusnya. Kelebihan tidak otomatis menjadi pendapatan. ${status}`,
      evidence: [shift],
      completeness: f.countKinds.length ? "complete" : "partial",
    });
  }
  const mismatch = f.countKinds.includes("count_3");
  if (mismatch) {
    alerts.push({
      ...base("COUNT_MISMATCH"),
      ...cashier,
      riskLevel: 2,
      title: "Hitungan laci #1 dan #2 berbeda",
      explanation: `Shift ${f.code}: hitungan #1 dan hitung ulang #2 berbeda per pecahan, sehingga dipakai hitungan #3. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  const month = f.businessDate.slice(0, 7);
  if (mismatch && f.cashierId && f.history.mismatchShifts >= 2) {
    alerts.push({
      ...base("COUNT_MISMATCH_REPEAT", `${f.cashierId}:${month}`),
      ...cashier,
      riskLevel: 3,
      title: "Hitungan laci berbeda berulang",
      explanation: `Dalam ${REPEAT_WINDOW_DAYS} hari: ${f.history.mismatchShifts} dari ${f.history.shifts} shift kasir yang sama memakai hitungan #3. Perlu pendampingan/cek prosedur hitung. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  if (f.discrepancy < 0 && f.cashierId && f.history.shortageShifts >= 3) {
    const rate = Math.round((f.history.shortageShifts / Math.max(1, f.history.shifts)) * 100);
    alerts.push({
      ...base("SHORTAGE_REPEAT", `${f.cashierId}:${month}`),
      ...cashier,
      riskLevel: 3,
      title: "Kekurangan kas berulang",
      explanation: `Dalam ${REPEAT_WINDOW_DAYS} hari: ${f.history.shortageShifts} dari ${f.history.shifts} shift (${rate}%) kasir yang sama kurang. Angka ini relatif terhadap jumlah shift, bukan peringkat pegawai. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  if (f.countSkippedReason) {
    alerts.push({
      ...base("EMERGENCY_CLOSE"),
      ...cashier,
      riskLevel: 3,
      title: "Tutup shift darurat tanpa hitungan pecahan",
      explanation: `Shift ${f.code} ditutup tanpa hitungan pecahan dengan alasan: "${f.countSkippedReason}". Bukti fisik kas kurang lengkap. ${status}`,
      evidence: [shift],
      completeness: "partial",
    });
  }
  if (f.qrisDiscrepancy !== null && f.qrisDiscrepancy !== 0) {
    alerts.push({
      ...base("QRIS_MISMATCH"),
      custodyScope: "qris",
      personUserId: null,
      personRole: null,
      riskLevel: 2,
      title: `Selisih QRIS ${rp(f.qrisDiscrepancy)}`,
      explanation: `Shift ${f.code}: total QRIS di aplikasi bank berbeda dari QRIS tercatat di POS. Ini rekonsiliasi QRIS (pending/settlement), bukan kas laci kasir. ${status}`,
      evidence: [shift],
      completeness: "partial",
    });
  }
  if (f.refundVoidCount >= REFUND_VOID_MANY) {
    alerts.push({
      ...base("REFUND_VOID_MANY"),
      ...cashier,
      riskLevel: 2,
      title: `${f.refundVoidCount} refund/batal tunai dalam satu shift`,
      explanation: `Shift ${f.code}: ${f.refundVoidCount} pengembalian uang tunai (refund/batal) tercatat di buku kas. Cek alasan & persetujuannya. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  if (f.methodFixCount >= METHOD_FIX_MANY) {
    alerts.push({
      ...base("METHOD_FIX_MANY"),
      ...cashier,
      riskLevel: 2,
      title: `${f.methodFixCount} koreksi metode bayar dalam satu shift`,
      explanation: `Shift ${f.code}: metode bayar (Tunai/QRIS) dikoreksi ${f.methodFixCount} kali. Cek referensi pembayaran. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  const direct = f.cashOutDirect;
  if (
    direct &&
    direct.count > 0 &&
    (direct.count >= CASH_OUT_DIRECT_MANY || (direct.limit > 0 && direct.total >= direct.limit * CASH_OUT_DIRECT_NEAR_LIMIT))
  ) {
    alerts.push({
      ...base("CASH_OUT_DIRECT_HIGH"),
      ...cashier,
      riskLevel: 1,
      title: `${direct.count} kas keluar tanpa ACC · ${rp(direct.total)}`,
      explanation: `Shift ${f.code}: ${direct.count} kas keluar laci tercatat langsung tanpa persetujuan, total ${rp(direct.total)}${
        direct.limit > 0 ? ` (batas shift ${rp(direct.limit)})` : ""
      }${direct.withoutReceipt ? `; ${direct.withoutReceipt} belum berfoto nota` : ""}. Cocokkan dengan nota/barang yang dibeli. ${status}`,
      evidence: [shift],
      completeness: direct.withoutReceipt ? "partial" : "complete",
    });
  }
  for (const deposit of f.unconfirmedDeposits) {
    const hours = (f.now.getTime() - deposit.recordedAt.getTime()) / 3_600_000;
    if (hours < DEPOSIT_UNCONFIRMED_HOURS) continue;
    alerts.push({
      ...base("DEPOSIT_UNCONFIRMED", deposit.id),
      eventAt: deposit.recordedAt,
      custodyScope: "bank",
      personUserId: null,
      personRole: null,
      riskLevel: 3,
      title: `Setoran ${rp(deposit.amount)} belum dikonfirmasi masuk rekening`,
      explanation: `Setoran ${deposit.ref} dari shift ${f.code} belum dikonfirmasi penerima lebih dari ${Math.floor(hours)} jam. Cocokkan dengan mutasi/bukti setor bank. ${status}`,
      evidence: [shift, { type: "cash_movement", ref: deposit.id, label: deposit.ref }],
      completeness: "partial",
    });
  }
  if (f.reviewSelfVerified) {
    alerts.push({
      ...base("SELF_VERIFIED"),
      custodyScope: "manager",
      personUserId: f.reviewedBy,
      personRole: "Owner",
      riskLevel: 1,
      title: "Diverifikasi tanpa pemeriksa kedua",
      explanation: `Shift ${f.code} diverifikasi oleh pemilik shift itu sendiri (Owner). Dicatat untuk transparansi.`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  if (f.ledgerBalance !== null && f.ledgerBalance !== f.expectedCash) {
    alerts.push({
      ...base("LEDGER_CACHE_MISMATCH"),
      custodyScope: "system",
      personUserId: null,
      personRole: null,
      riskLevel: 5,
      title: "Saldo laci tidak sama dengan buku kas",
      explanation: `Shift ${f.code}: kas seharusnya tersimpan ${rp(f.expectedCash)}, buku kas ${rp(f.ledgerBalance)}. Kemungkinan bug atau perubahan data di luar buku kas — periksa audit log. ${status}`,
      evidence: [shift],
      completeness: "complete",
    });
  }
  return alerts;
}
