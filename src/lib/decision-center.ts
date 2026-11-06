// Owner Decision Center (Smart Approval V3, Batch 4) — penjelasan keputusan berbasis aturan, murni
// (tanpa DB). Fakta hanya dari data pengajuan & objek sumbernya; dugaan dan hal yang belum diketahui
// selalu dipisah. Rekomendasi AYA di sini = rekomendasi aturan, bukan keputusan.
import { APPROVAL_CATEGORY_LABEL, type ApprovalCategory } from "@/lib/approval-rules";
import type { ApprovalExecutionStatus, ApprovalReviewState, ApprovalRiskTier } from "@/lib/smart-approval";

export type DecisionApproval = {
  id: string;
  type: string;
  category: ApprovalCategory;
  requester: string;
  amount: string;
  amountValue: number | null;
  reason: string;
  risk: string;
  riskTier: ApprovalRiskTier;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decidedVia: string | null;
  reasonDecided: string | null;
  executionStatus: ApprovalExecutionStatus;
  executionError: string | null;
  executionAttempts: number;
  executedAt: string | null;
  reviewState: ApprovalReviewState | null;
  reviewNote: string | null;
  payload: Record<string, unknown>;
};

export type DecisionSubject = {
  order?: { id: string; orderNo: string; status: string; total: number } | null;
  cashSession?: { id: string; status: string; expectedCash: number; actualCash: number | null; discrepancy: number } | null;
  expense?: { id: string; status: string; amount: number } | null;
  document?: {
    id: string;
    title: string;
    approvedVersion: number | null;
    currentVersion: number;
    version: { id: string; version: number; reviewStatus: string; sha256: string | null; fileName: string; sizeBytes: number } | null;
  } | null;
};

export type Recommendation = "approve" | "approve_with_note" | "reject" | "request_revision" | "defer";

export type DecisionExplanation = {
  problem: string;
  checks: Array<{ label: string; value: string; ok: boolean | null; source: string }>;
  facts: string[];
  hypotheses: string[];
  unknowns: string[];
  recommendation: { action: Recommendation; title: string; reason: string; basis: "aturan" };
  consequences: Record<"approve" | "reject" | "defer" | "request_revision", string>;
  riskBenefit: { risks: string[]; benefits: string[] };
  changes: string[];
  beforeAfter: Array<{ label: string; before: number | null; after: number | null }> | null;
  followUp: string[];
};

const rp = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `Rp${Math.round(n).toLocaleString("id-ID")}`);

const PROBLEM: Record<ApprovalCategory, string> = {
  void: "Kasir meminta membatalkan seluruh transaksi.",
  refund: "Kasir meminta mengembalikan uang untuk sebagian/seluruh item yang sudah dibayar.",
  diskon: "Kasir meminta diskon manual di atas batas yang boleh diberikan sendiri.",
  pengeluaran: "Staf mengajukan pengeluaran uang yang butuh persetujuan.",
  selisih_kas: "Uang laci saat tutup shift tidak sama dengan catatan sistem.",
  stok: "Hasil hitung stok berbeda dengan stok tercatat dan perlu disahkan.",
  dokumen: "Versi baru dokumen/SOP perusahaan diunggah dan belum berlaku sampai disetujui.",
  lainnya: "Pengajuan lain yang butuh keputusan.",
};

const CHANGES: Record<ApprovalCategory, string[]> = {
  void: ["Order berubah status menjadi Dibatalkan (voided).", "Stok bahan resep dikembalikan ke ruang & batch asal.", "Bila sudah lunas: uang keluar dari laci shift yang membayar keluar (buku kas)."],
  refund: ["Item terpilih direfund; total order berkurang.", "Uang refund keluar dari laci (tunai) / dicatat sebagai refund non-tunai.", "Stok item yang belum dibuat dikembalikan; yang sudah dibuat dicatat waste."],
  diskon: ["Kasir boleh memakai diskon sebesar nominal yang disetujui pada order berikutnya.", "Tidak ada uang/stok yang berubah sampai order dibayar."],
  pengeluaran: ["Status biaya menjadi disetujui; bila sumbernya laci/rekening, saldo akun berkurang sesuai buku kas.", "Masuk laporan biaya (P&L) sesuai kategori."],
  selisih_kas: ["Selisih shift tercatat sebagai disetujui Manajer/Owner (sign-off).", "Tidak mengubah angka hitungan; tetap tercatat di laporan & risiko."],
  stok: ["Penyesuaian opname diposting ke stok.", "Nilai persediaan berubah sesuai selisih × HPP rata-rata."],
  dokumen: ["Versi ini menjadi versi BERLAKU dokumen tersebut.", "Versi berlaku sebelumnya tetap tersimpan sebagai riwayat (tidak dihapus).", "Tidak ada uang/stok yang berubah."],
  lainnya: ["Tidak ada perubahan otomatis tercatat untuk jenis ini."],
};

export function explainApproval(a: DecisionApproval, s: DecisionSubject): DecisionExplanation {
  const checks: DecisionExplanation["checks"] = [];
  const facts: string[] = [];
  const hypotheses: string[] = [];
  const unknowns: string[] = [];
  const followUp: string[] = [];
  let beforeAfter: DecisionExplanation["beforeAfter"] = null;
  let rec: DecisionExplanation["recommendation"] = { action: "approve_with_note", title: "Setujui dengan catatan", reason: "Data dasar lengkap; pastikan alasan sesuai kebijakan.", basis: "aturan" };

  facts.push(`Diajukan oleh ${a.requester} · nominal ${a.amountValue !== null ? rp(a.amountValue) : a.amount} · risiko ${a.risk} (${a.riskTier}).`);
  checks.push({ label: "Alasan tertulis", value: a.reason ? "Ada" : "Kosong", ok: Boolean(a.reason?.trim()), source: "approvals" });

  if (a.category === "void" || a.category === "refund") {
    const order = s.order ?? null;
    if (!order) {
      checks.push({ label: "Order terkait", value: "Tidak ditemukan", ok: false, source: "orders" });
      unknowns.push("Order sumber tidak ditemukan — pengajuan tidak bisa diverifikasi.");
      rec = { action: "request_revision", title: "Minta bukti/revisi", reason: "Order sumber tidak terbaca.", basis: "aturan" };
    } else {
      checks.push({ label: "Order", value: `${order.orderNo} · ${order.status} · ${rp(order.total)}`, ok: true, source: "orders" });
      facts.push(`Order ${order.orderNo} saat ini berstatus "${order.status}" dengan total ${rp(order.total)}.`);
      const refundAmount = typeof a.payload.refundAmount === "number" ? a.payload.refundAmount : a.amountValue;
      if (order.status === "voided") {
        rec = { action: "reject", title: "Tolak — order sudah dibatalkan", reason: "Order sudah berstatus dibatalkan; tidak ada yang perlu dijalankan lagi.", basis: "aturan" };
      } else if (a.category === "refund" && order.status !== "paid") {
        rec = { action: "reject", title: "Tolak — order tidak berstatus lunas", reason: "Refund hanya untuk order lunas; pelaksanaan akan gagal.", basis: "aturan" };
      } else if (a.riskTier === "R3") {
        rec = { action: "request_revision", title: "Minta bukti dulu", reason: "Nominal besar (R3): minta foto struk/alasan pelanggan sebelum memutus.", basis: "aturan" };
      }
      if (refundAmount !== null && refundAmount !== undefined) {
        beforeAfter = [{ label: "Total order", before: order.total, after: Math.max(0, order.total - (a.category === "void" ? order.total : refundAmount)) }];
      }
      hypotheses.push("Kemungkinan kesalahan input kasir atau permintaan pelanggan — belum terbukti tanpa bukti struk/CCTV.");
    }
  } else if (a.category === "selisih_kas") {
    const cs = s.cashSession ?? null;
    if (!cs) {
      unknowns.push("Shift sumber tidak ditemukan.");
      rec = { action: "request_revision", title: "Minta bukti/revisi", reason: "Shift sumber tidak terbaca.", basis: "aturan" };
    } else {
      checks.push({ label: "Shift", value: `${cs.status} · selisih ${rp(cs.discrepancy)}`, ok: cs.status === "closed", source: "cash_sessions" });
      facts.push(`Kas seharusnya ${rp(cs.expectedCash)}, dihitung ${rp(cs.actualCash)}, selisih ${rp(cs.discrepancy)}.`);
      beforeAfter = [{ label: "Kas laci", before: cs.expectedCash, after: cs.actualCash }];
      hypotheses.push("Penyebab umum: pembayaran QRIS tercatat tunai, kembalian salah, atau kas keluar belum dicatat — belum terbukti.");
      unknowns.push("Hasil cocok mutasi QRIS dan hitung ulang orang kedua belum dilampirkan di pengajuan ini.");
      rec = Math.abs(cs.discrepancy) > 10_000
        ? { action: "defer", title: "Tunda — hitung ulang & cocokkan QRIS", reason: "Selisih di atas toleransi; minta hitung ulang orang kedua dan cocokkan mutasi QRIS dulu.", basis: "aturan" }
        : { action: "approve_with_note", title: "Setujui dengan catatan", reason: "Selisih kecil; tetap tercatat untuk pola berulang.", basis: "aturan" };
    }
  } else if (a.category === "pengeluaran") {
    const ex = s.expense ?? null;
    if (ex) {
      checks.push({ label: "Biaya", value: `${ex.status} · ${rp(ex.amount)}`, ok: ex.status === "pending_approval", source: "expenses" });
      facts.push(`Biaya tercatat ${rp(ex.amount)} dengan status "${ex.status}".`);
      if (ex.status !== "pending_approval") rec = { action: "reject", title: "Periksa — status biaya sudah berubah", reason: "Biaya tidak lagi menunggu persetujuan.", basis: "aturan" };
    } else {
      unknowns.push("Data biaya tidak ditemukan.");
    }
    unknowns.push("Nota/kwitansi tidak terlampir di pengajuan ini kecuali disebut di alasan.");
  } else if (a.category === "diskon") {
    facts.push(`Diskon yang diminta ${a.amount}.`);
    if (a.riskTier === "R3") rec = { action: "request_revision", title: "Minta alasan tambahan", reason: "Diskon besar; minta alasan pelanggan/kompensasi tertulis.", basis: "aturan" };
  } else if (a.category === "stok") {
    facts.push(`Selisih opname: ${a.amount}.`);
    unknowns.push("Rincian per bahan ada di modul Gudang → Opname.");  } else if (a.category === "dokumen") {
    const doc = s.document ?? null;
    const v = doc?.version ?? null;
    if (doc && v) {
      facts.push(`Dokumen "${doc.title}" versi ${v.version} (${v.fileName}, ${Math.max(1, Math.round(v.sizeBytes / 1024))} KB).`);
      facts.push(doc.approvedVersion ? `Versi berlaku saat ini: v${doc.approvedVersion}.` : "Belum ada versi berlaku sebelumnya.");
      checks.push({ label: "Status versi", value: v.reviewStatus, ok: v.reviewStatus === "pending", source: "company_document_versions" });
      checks.push({ label: "Sidik file (SHA-256)", value: v.sha256 ? `${v.sha256.slice(0, 12)}…` : "Tidak tercatat", ok: Boolean(v.sha256), source: "company_document_versions" });
      if (v.reviewStatus !== "pending") {
        rec = { action: "reject", title: "Periksa — versi sudah diputus", reason: "Versi ini tidak lagi menunggu persetujuan.", basis: "aturan" };
      } else if (doc.approvedVersion !== null && v.version < doc.approvedVersion) {
        rec = { action: "reject", title: "Tolak — versi lebih lama", reason: `Sudah ada versi berlaku yang lebih baru (v${doc.approvedVersion}).`, basis: "aturan" };
      } else {
        rec = { action: "approve_with_note", title: "Baca dulu, lalu setujui", reason: "Isi dokumen tidak dinilai otomatis — unduh dan baca versi ini sebelum menyetujui.", basis: "aturan" };
      }
    } else {
      unknowns.push("Data dokumen/versi tidak ditemukan.");
      rec = { action: "reject", title: "Tolak — data tidak ditemukan", reason: "Versi dokumen yang diajukan tidak ada lagi.", basis: "aturan" };
    }
    unknowns.push("Isi dokumen belum diperiksa AYA (hanya metadata & sidik file).");
  }

  if (a.reviewState === "revision_requested") followUp.push(`Menunggu bukti/revisi: ${a.reviewNote ?? "-"}`);
  if (a.executionStatus === "failed") {
    followUp.push(`Pelaksanaan gagal (${a.executionAttempts}×): ${a.executionError ?? "-"}. Perbaiki penyebab lalu putuskan ulang.`);
    rec = { action: "defer", title: "Perbaiki penyebab kegagalan dulu", reason: "Keputusan sebelumnya gagal dijalankan; ulangi setelah penyebab jelas.", basis: "aturan" };
  }
  if (a.executionStatus === "running") followUp.push("Pelaksanaan belum terverifikasi — cek objek sumber sebelum mengambil tindakan lain.");

  const money = a.category !== "stok" && a.category !== "lainnya" && a.category !== "dokumen";
  return {
    problem: PROBLEM[a.category],
    checks,
    facts,
    hypotheses,
    unknowns,
    recommendation: rec,
    consequences: {
      approve: `${APPROVAL_CATEGORY_LABEL[a.category]} dijalankan lewat jalur resmi. Status "Disetujui" baru dianggap selesai setelah pelaksanaan berhasil tercatat.`,
      reject:
        a.category === "dokumen"
          ? "Versi ditandai ditolak; versi berlaku sebelumnya tetap dipakai. File tidak dihapus."
          : "Tidak ada perubahan uang/stok. Pemohon melihat alasan penolakan. Pengajuan biaya ditandai ditolak.",
      defer: "Tetap Menunggu dengan tanda Ditunda + catatan. Tidak ada perubahan data.",
      request_revision: "Tetap Menunggu; pemohon diminta melengkapi bukti. Tidak ada perubahan data.",
    },
    riskBenefit: {
      risks: [
        money
          ? "Uang keluar/berubah tidak bisa ditarik kembali kecuali lewat pembalik resmi."
          : a.category === "dokumen"
            ? "Staf membaca versi yang salah bila isi belum diperiksa."
            : a.category === "stok"
              ? "Nilai persediaan berubah."
              : "Perubahan data sesuai jenis pengajuan.",
        a.riskTier === "R3" ? "Risiko tinggi: wajib 2FA Owner." : "Risiko sedang/rendah.",
      ],
      benefits: ["Catatan transaksi sesuai kejadian nyata.", "Pengajuan tidak menumpuk di antrean."],
    },
    changes: CHANGES[a.category],
    beforeAfter,
    followUp,
  };
}

/** Skor urutan antrean: R3 & gagal dulu, lalu umur, lalu nominal. */
export function decisionPriority(a: Pick<DecisionApproval, "riskTier" | "createdAt" | "amountValue" | "executionStatus" | "reviewState">, now: number) {
  const tier = a.riskTier === "R3" ? 3000 : a.riskTier === "R2" ? 1500 : 0;
  const failed = a.executionStatus === "failed" ? 4000 : 0;
  const parked = a.reviewState ? -800 : 0;
  const ageMin = Math.max(0, (now - new Date(a.createdAt).getTime()) / 60_000);
  return failed + tier + parked + Math.min(ageMin, 1440) + Math.min((a.amountValue ?? 0) / 100_000, 200);
}
