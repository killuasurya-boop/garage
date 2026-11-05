// Smart Approval V3 (Owner, Nov 2026) — aturan murni bersama server + UI (tanpa dependensi server).
// Keputusan ≠ pelaksanaan: status keputusan ada di `approvals.status`, hasil pelaksanaan di
// `approvals.execution_status`. Fungsi di sini tidak pernah mengubah data.
import { approvalCategoryOf, type ApprovalCategory } from "@/lib/approval-rules";

export type ApprovalRiskTier = "R1" | "R2" | "R3";
export type ApprovalExecutionStatus = "not_required" | "running" | "succeeded" | "failed" | "legacy";
export type ApprovalReviewState = "deferred" | "revision_requested";

/** Kategori yang memindahkan uang (laci, refund, biaya). */
export const MONEY_CATEGORIES: ReadonlySet<ApprovalCategory> = new Set(["void", "refund", "selisih_kas", "pengeluaran", "diskon"]);
/** Kategori yang tidak boleh disetujui massal: uang keluar/masuk laci atau stok fisik. */
export const NO_BULK_APPROVE: ReadonlySet<ApprovalCategory> = new Set(["void", "refund", "selisih_kas", "stok"]);

export type ApprovalRuleRow = { id: string; type: string; risk: string; amountValue?: number | null };

/** "Rp1.234.567" → 1234567. Label stok ("+10") tidak dianggap rupiah. */
export function parseRupiahLabel(label: string): number | null {
  if (!/rp/i.test(label)) return null;
  const digits = label.replace(/[^\d]/g, "");
  if (!digits || digits.length > 12) return null;
  return Number(digits);
}

export function isHighRisk(row: Pick<ApprovalRuleRow, "risk">) {
  return /^(high|critical|tinggi|kritis)$/i.test(row.risk.trim());
}

/**
 * R1 = rendah, tanpa uang · R2 = sedang / menyangkut uang · R3 = risiko tinggi dan menyangkut uang
 * (refund, void, selisih kas, pengeluaran besar). R3 tidak pernah boleh otomatis atau massal.
 */
export function approvalRiskTier(row: ApprovalRuleRow): ApprovalRiskTier {
  const category = approvalCategoryOf(row);
  const money = MONEY_CATEGORIES.has(category);
  if (isHighRisk(row) && (money || category === "stok")) return "R3";
  if (money || category === "stok" || /^medium|sedang$/i.test(row.risk.trim())) return "R2";
  return "R1";
}

/** Alasan bulk ditolak untuk baris ini (null = boleh). Tolak massal selalu boleh (alasan wajib di route). */
export function bulkDecisionBlockReason(row: ApprovalRuleRow, status: "approved" | "rejected"): string | null {
  if (status === "rejected") return null;
  const category = approvalCategoryOf(row);
  if (approvalRiskTier(row) === "R3") return "Risiko tinggi (R3) — putuskan satu per satu dengan verifikasi.";
  if (NO_BULK_APPROVE.has(category)) return "Menggerakkan uang laci/stok — putuskan satu per satu.";
  return null;
}

export const AUTO_APPROVAL_DAILY_LIMIT_PER_REQUESTER = 3;

/**
 * Auto-approval hanya untuk pengeluaran risiko rendah/sedang di bawah batas, punya pemohon tercatat,
 * pemohon ≠ yang menjalankan, dan belum melewati batas harian per pemohon. Lainnya: manual.
 */
export function autoApprovalDecision(
  row: ApprovalRuleRow & { requestedBy?: string | null },
  ctx: { threshold: number; sweeperUserId: string; autoApprovedTodayForRequester: number },
): { approve: boolean; reason: string } {
  const category = approvalCategoryOf(row);
  if (category !== "pengeluaran") return { approve: false, reason: "Tipe ini selalu diputus manual." };
  if (approvalRiskTier(row) === "R3" || isHighRisk(row)) return { approve: false, reason: "Risiko tinggi — wajib diputus manual." };
  const amount = row.amountValue ?? null;
  if (amount === null || amount <= 0) return { approve: false, reason: "Nominal tidak terbaca — cek manual." };
  if (amount >= ctx.threshold) return { approve: false, reason: "Nominal ≥ batas — perlu dicek manual." };
  if (!row.requestedBy) return { approve: false, reason: "Pemohon tidak tercatat — cek manual." };
  if (row.requestedBy === ctx.sweeperUserId) return { approve: false, reason: "Pengajuan Anda sendiri harus disetujui orang lain." };
  if (ctx.autoApprovedTodayForRequester >= AUTO_APPROVAL_DAILY_LIMIT_PER_REQUESTER) {
    return { approve: false, reason: `Pemohon sudah ${ctx.autoApprovedTodayForRequester}× disetujui otomatis hari ini — cek manual.` };
  }
  return { approve: true, reason: `Pengeluaran Rp${amount.toLocaleString("id-ID")} di bawah batas Rp${ctx.threshold.toLocaleString("id-ID")}, risiko ${row.risk}.` };
}

/** Manajer hanya memutus pengajuan outletnya sendiri; Owner semua; pengajuan lama tanpa outlet tetap terbuka. */
export function canDecideForOutlet(role: string, profileOutletId: string | null | undefined, approvalOutletId: string | null | undefined) {
  if (role === "Owner") return true;
  if (!approvalOutletId) return true;
  return Boolean(profileOutletId) && profileOutletId === approvalOutletId;
}

export const EXECUTION_STATUS_LABEL: Record<ApprovalExecutionStatus, string> = {
  not_required: "Tidak ada pelaksanaan",
  running: "Sedang dijalankan — belum terverifikasi",
  succeeded: "Berhasil dijalankan",
  failed: "Gagal dijalankan",
  legacy: "Diputus sebelum V3 (tanpa bukti pelaksanaan)",
};

export const REVIEW_STATE_LABEL: Record<ApprovalReviewState, string> = {
  deferred: "Ditunda",
  revision_requested: "Minta bukti/revisi",
};
