// Audit Smart Approval Tahap B (SA-05/SA-06/SA-07/SA-10) — aturan murni rekonsiliasi pengajuan.
// Tanpa DB: menerima fakta objek sumber, mengembalikan keputusan. Dipakai approval-reconcile.ts.

export type ReconcileSource = {
  /** Status order terkait (void/refund/PCX), null bila tidak ada/tidak ditemukan. */
  orderStatus?: string | null;
  /** APP-PCX: status bill pisahan yang sudah dibuat. */
  splitChildStatus?: string | null;
  /** APP-CASH: sign-off selisih sudah tercatat. */
  cashSignedOff?: boolean;
  /** APP-DOC: status review versi dokumen. */
  documentReviewStatus?: string | null;
  /** APP-EXP: status biaya. */
  expenseStatus?: string | null;
};

/** Alasan pengajuan MENUNGGU sudah tidak relevan (objek sumber berubah lewat jalur lain), atau null. */
export function supersedeReason(id: string, source: ReconcileSource): string | null {
  if (id.startsWith("APP-OPN-")) return "Jalur opname lama sudah dimatikan — hitung ulang di Gudang → Stok Opname.";
  if (id.startsWith("APP-VOID-") && source.orderStatus === "voided") return "Order sudah dibatalkan lewat jalur lain.";
  if (id.startsWith("APP-RFD-") && source.orderStatus && source.orderStatus !== "paid") {
    return `Order tidak lagi berstatus lunas (${source.orderStatus}) — refund tidak berlaku.`;
  }
  if (id.startsWith("APP-PCX-") && (source.orderStatus === "voided" || source.orderStatus === "paid")) {
    return source.orderStatus === "paid" ? "Bill sudah dibayar — batal item lewat refund." : "Bill sudah dibatalkan seluruhnya.";
  }
  if (id.startsWith("APP-DOC-") && source.documentReviewStatus && source.documentReviewStatus !== "pending") {
    return "Versi dokumen sudah diputus lewat jalur lain.";
  }
  return null;
}

/**
 * Pelaksanaan "running" yang macet: cek objek sumber. "succeeded" hanya bila efeknya terbukti;
 * selain itu "uncertain" (jangan pernah dianggap berhasil tanpa bukti).
 */
export function verifyStuckExecution(id: string, status: string, source: ReconcileSource): "succeeded" | "uncertain" {
  if (status === "rejected") {
    if (id.startsWith("APP-EXP-")) return source.expenseStatus === "rejected" ? "succeeded" : "uncertain";
    if (id.startsWith("APP-DOC-")) return source.documentReviewStatus === "rejected" ? "succeeded" : "uncertain";
    return "uncertain";
  }
  if (id.startsWith("APP-VOID-")) return source.orderStatus === "voided" ? "succeeded" : "uncertain";
  if (id.startsWith("APP-PCX-")) return source.splitChildStatus === "voided" ? "succeeded" : "uncertain";
  if (id.startsWith("APP-CASH-")) return source.cashSignedOff ? "succeeded" : "uncertain";
  if (id.startsWith("APP-DOC-")) return source.documentReviewStatus === "approved" ? "succeeded" : "uncertain";
  if (id.startsWith("APP-EXP-")) return source.expenseStatus && source.expenseStatus !== "pending_approval" ? "succeeded" : "uncertain";
  return "uncertain";
}

/** Push ke Owner: R3 baru segera; selain itu bila menunggu ≥ escalateAfterMinutes. */
export function notificationFor(
  row: { id: string; tier: "R1" | "R2" | "R3"; createdAt: Date; reviewState: string | null },
  now: number,
  escalateAfterMinutes: number,
): { kind: "approval_r3" | "approval_escalation"; dedupKey: string; severity: "urgent" | "warning" } | null {
  if (row.reviewState) return null;
  if (row.tier === "R3") return { kind: "approval_r3", dedupKey: `approval-r3:${row.id}`, severity: "urgent" };
  const ageMin = (now - row.createdAt.getTime()) / 60_000;
  if (row.tier === "R2" && ageMin >= escalateAfterMinutes) {
    return { kind: "approval_escalation", dedupKey: `approval-esc:${row.id}`, severity: "warning" };
  }
  return null;
}
