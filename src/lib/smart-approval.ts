// Smart Approval V3 (Owner, Nov 2026) — aturan murni bersama server + UI (tanpa dependensi server).
// Keputusan ≠ pelaksanaan: status keputusan ada di `approvals.status`, hasil pelaksanaan di
// `approvals.execution_status`. Fungsi di sini tidak pernah mengubah data.
import { approvalCategoryOf, type ApprovalCategory } from "@/lib/approval-rules";

export type ApprovalRiskTier = "R1" | "R2" | "R3";
export type ApprovalExecutionStatus = "not_required" | "running" | "succeeded" | "failed" | "uncertain" | "legacy";
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
/** Diskon manual: R3 (Owner + 2FA) mulai nominal ini. */
export const DISCOUNT_R3_MIN_AMOUNT = 100_000;

export function approvalRiskTier(row: ApprovalRuleRow): ApprovalRiskTier {
  const category = approvalCategoryOf(row);
  const money = MONEY_CATEGORIES.has(category);
  // Diskon: R3 ditentukan nominal uang (≥ Rp100.000), bukan persentase — diskon kecil berpersentase tinggi tetap
  // bisa disetujui Manajer di lokasi (R2). Nominal tak terbaca → tetap R3 (aman).
  if (category === "diskon" && isHighRisk(row) && row.amountValue !== null && row.amountValue !== undefined && row.amountValue < DISCOUNT_R3_MIN_AMOUNT) {
    return "R2";
  }
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

/** Pengajuan yang hanya boleh diputus/dilihat Owner (dokumen perusahaan = hak `company:manage`, Owner saja). */
export function ownerOnlyApproval(id: string) {
  return id.startsWith("APP-DOC-");
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
  uncertain: "Tidak pasti — hasil tidak terbukti, cek objek sumber",
  legacy: "Diputus sebelum V3 (tanpa bukti pelaksanaan)",
};

export const REVIEW_STATE_LABEL: Record<ApprovalReviewState, string> = {
  deferred: "Ditunda",
  revision_requested: "Minta bukti/revisi",
};

/**
 * Jalur keputusan. "langsung" = pengaju yang berwenang memutus saat membuat (kode internal);
 * "auto" = sweep auto-approval; "chatgpt" = tool MCP lewat preview + token (+ kode 2FA untuk R3);
 * "agent_key" = API key agent statis (tanpa manusia) — tidak boleh memutus.
 */
export type DecisionChannel = "board" | "pin" | "langsung" | "auto" | "decision_center" | "chatgpt" | "owner_command" | "agent_key";

export const DECISION_CHANNEL_LABEL: Record<DecisionChannel, string> = {
  board: "Papan Persetujuan",
  pin: "PIN di kasir",
  langsung: "Langsung oleh pengaju yang berwenang",
  auto: "Otomatis (aturan auto-approval)",
  decision_center: "Decision Center",
  chatgpt: "ChatGPT (konfirmasi + kode 2FA)",
  owner_command: "AI Command layar Owner (konfirmasi + kode 2FA)",
  agent_key: "API key agent",
};

export type DecisionPolicyInput = {
  tier: ApprovalRiskTier;
  status: "approved" | "rejected";
  role: string;
  channel: DecisionChannel;
  /** Sesi dari API key agent statis. */
  agentKey: boolean;
  /** Kode 2FA Owner sudah diverifikasi untuk keputusan INI (Decision Center / konfirmasi ChatGPT R3). */
  stepUpVerified: boolean;
};

export type DecisionPolicyBlock = { code: string; message: string };

/**
 * Smart Approval kebijakan pusat (audit SA-01/SA-02): satu aturan untuk semua jalur, dipanggil di
 * decideApproval sebelum klaim. Menolak (reject) selalu boleh bagi yang berwenang — tidak ada uang/stok
 * yang bergerak. Menyetujui R3 = Owner + kode 2FA untuk keputusan itu; Owner yang membuat sendiri
 * ("langsung") tercatat sebagai keputusan sendiri. API key agent tidak pernah memutus.
 */
export function decisionPolicyBlock(input: DecisionPolicyInput): DecisionPolicyBlock | null {
  if (input.agentKey || input.channel === "agent_key") {
    return { code: "AGENT_CANNOT_DECIDE", message: "API key agent hanya boleh membaca dan mengajukan — keputusan diambil manusia (Owner/Manajer)." };
  }
  if (input.status === "rejected" || input.tier !== "R3") return null;
  if (input.role !== "Owner") {
    return { code: "R3_OWNER_ONLY", message: "Risiko tinggi (R3) hanya disetujui Owner. Tolak atau biarkan menunggu Owner." };
  }
  if (input.channel === "langsung") return null;
  if (input.channel === "pin" || input.channel === "auto") {
    return { code: "R3_STEP_UP_REQUIRED", message: "Risiko tinggi (R3) disetujui Owner dari Decision Center dengan kode 2FA, bukan lewat PIN/otomatis." };
  }
  if (!input.stepUpVerified) {
    return { code: "R3_STEP_UP_REQUIRED", message: "Risiko tinggi (R3): setujui dari Owner Decision Center dengan kode 2FA." };
  }
  return null;
}

/**
 * Audit SA-05: masa berlaku per jenis (jam). Diskon manual dipakai di transaksi yang sedang berjalan —
 * persetujuan yang tidak dipakai 6 jam kedaluwarsa (pengajuan maupun hasil setujunya). Jenis lain tidak
 * kedaluwarsa otomatis; mereka ditandai "superseded" bila objek sumbernya sudah berubah.
 */
export const APPROVAL_TTL_HOURS: Partial<Record<string, number>> = { "APP-DISC-": 6 };

export function approvalExpiresAt(id: string, from: Date): Date | null {
  for (const [prefix, hours] of Object.entries(APPROVAL_TTL_HOURS)) {
    if (id.startsWith(prefix) && hours) return new Date(from.getTime() + hours * 3_600_000);
  }
  return null;
}

/** Eskalasi: pengajuan R2 yang menunggu lebih dari ini dikirim ke Owner (push). */
export const APPROVAL_ESCALATE_AFTER_MINUTES = 30;
/** Pelaksanaan "running" lebih lama dari ini diperiksa ulang ke objek sumber. */
export const EXECUTION_STUCK_AFTER_MINUTES = 5;
