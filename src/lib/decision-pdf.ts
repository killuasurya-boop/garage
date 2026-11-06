// Batch 7c — PDF keputusan Owner Decision Center (satu pengajuan). Gaya & penulis sama dengan
// PDF resmi Owner (shift-accountability-pdf). Isi = data getDecisionDetail apa adanya: fakta,
// dugaan, hal yang belum diketahui, rekomendasi ATURAN (bukan keputusan), konsekuensi, keputusan
// & status pelaksanaan terpisah, timeline audit, sidik data. Watermark DRAFT sampai diputus dan
// pelaksanaannya tercatat (disetujui ≠ berhasil).
import { APPROVAL_CATEGORY_LABEL } from "@/lib/approval-rules";
import type { DecisionApproval, DecisionExplanation } from "@/lib/decision-center";
import {
  OfficialPdfWriter as Writer,
  officialCover as cover,
  pdfDateTime as dateTime,
  pdfRp as rp,
  pdfText as text,
  PDF_MUTED,
  PDF_RED,
} from "@/lib/shift-accountability-pdf";
import { DECISION_CHANNEL_LABEL, EXECUTION_STATUS_LABEL, REVIEW_STATE_LABEL } from "@/lib/smart-approval";

export type DecisionPdfInput = {
  approval: DecisionApproval;
  explanation: DecisionExplanation;
  snapshotHash: string;
  checkedAt: string;
  timeline: Array<{ time: string; actor: string; action: string; status: string | null }>;
};

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu keputusan", approved: "Disetujui", rejected: "Ditolak" };
const VIA_LABEL: Record<string, string> = DECISION_CHANNEL_LABEL;
const REC_LABEL: Record<string, string> = {
  approve: "Setujui",
  approve_with_note: "Setujui dengan catatan",
  reject: "Tolak",
  request_revision: "Minta revisi",
  defer: "Tunda",
};

/** Final = sudah diputus DAN (ditolak, atau pelaksanaan tidak perlu / berhasil). Selain itu tetap DRAFT. */
export function decisionPdfIsFinal(a: Pick<DecisionApproval, "status" | "executionStatus">) {
  if (a.status === "rejected") return true;
  return a.status === "approved" && (a.executionStatus === "succeeded" || a.executionStatus === "not_required" || a.executionStatus === "legacy");
}

export function decisionPdfFileName(a: Pick<DecisionApproval, "id">, checkedAt: string) {
  const day = checkedAt.slice(0, 10);
  return `GarageOS_Keputusan_${a.id.replace(/[^A-Za-z0-9-]/g, "").slice(0, 60)}_${day}.pdf`;
}

export async function renderDecisionPdf(d: DecisionPdfInput) {
  const a = d.approval;
  const ex = d.explanation;
  const final = decisionPdfIsFinal(a);
  const w = new Writer(`Keputusan ${a.id}`);
  w.watermark = final ? null : a.status === "pending" ? "DRAFT · BELUM DIPUTUS" : "DRAFT · PELAKSANAAN BELUM TERVERIFIKASI";

  cover(w, "Lembar Keputusan Owner", text(a.type), [
    ["ID pengajuan", a.id],
    ["Jenis", APPROVAL_CATEGORY_LABEL[a.category] ?? a.category],
    ["Pemohon", text(a.requester)],
    ["Nominal", a.amountValue !== null ? rp(a.amountValue) : text(a.amount)],
    ["Tingkat risiko", `${a.riskTier} (${text(a.risk)})`],
    ["Diajukan", dateTime(a.createdAt)],
    ["Status keputusan", STATUS_LABEL[a.status] ?? a.status],
    ["Status pelaksanaan", EXECUTION_STATUS_LABEL[a.executionStatus] ?? a.executionStatus],
  ]);

  w.section("A. Apa masalahnya");
  w.paragraph(ex.problem);
  w.paragraph(`Alasan pemohon: ${text(a.reason)}`, { color: PDF_MUTED, size: 8 });

  w.section("B. Hasil pemeriksaan");
  w.table(
    [
      { label: "Pemeriksaan", width: 30 },
      { label: "Hasil", width: 40 },
      { label: "Sesuai?", width: 12 },
      { label: "Sumber", width: 18 },
    ],
    ex.checks.map((c) => [c.label, c.value, c.ok === null ? "-" : c.ok ? "Ya" : "Tidak", c.source]),
    { empty: "Tidak ada pemeriksaan otomatis untuk jenis ini." },
  );

  w.section("C. Analisis", "portrait", "Fakta, dugaan dan hal yang belum diketahui selalu dipisah.");
  w.keyValues([
    ["Fakta", ex.facts.length ? ex.facts.join("\n") : "-"],
    ["Dugaan (belum pasti)", ex.hypotheses.length ? ex.hypotheses.join("\n") : "Tidak ada dugaan."],
    ["Belum diketahui", ex.unknowns.length ? ex.unknowns.join("\n") : "-"],
  ], 0.3);

  w.section("D. Rekomendasi AYA (berbasis aturan)");
  const recAction = REC_LABEL[ex.recommendation.action] ?? ex.recommendation.action;
  w.paragraph(ex.recommendation.title.startsWith(recAction) ? ex.recommendation.title : `${recAction}: ${ex.recommendation.title}`, { bold: true });
  w.paragraph(ex.recommendation.reason);
  w.paragraph("Rekomendasi aturan, bukan keputusan. Keputusan tetap di tangan Owner.", { color: PDF_MUTED, size: 7.5 });

  w.section("E. Konsekuensi tiap pilihan");
  w.keyValues([
    ["Setujui", ex.consequences.approve],
    ["Tolak", ex.consequences.reject],
    ["Tunda", ex.consequences.defer],
    ["Minta revisi", ex.consequences.request_revision],
  ], 0.25);

  w.section("F. Risiko & manfaat · G. Perubahan yang akan dilakukan");
  w.keyValues([
    ["Risiko", ex.riskBenefit.risks.join("\n")],
    ["Manfaat", ex.riskBenefit.benefits.join("\n")],
    ["Perubahan bila disetujui", ex.changes.join("\n")],
  ], 0.3);
  if (ex.beforeAfter?.length) {
    w.table(
      [
        { label: "Angka", width: 40 },
        { label: "Sebelum", width: 30, align: "right" },
        { label: "Sesudah (perkiraan aturan)", width: 30, align: "right" },
      ],
      ex.beforeAfter.map((row) => [row.label, rp(row.before), rp(row.after)]),
    );
  }

  w.section("H. Keputusan & hasil aktual");
  w.keyValues([
    ["Keputusan", STATUS_LABEL[a.status] ?? a.status],
    ["Diputus oleh", text(a.decidedByName)],
    ["Waktu keputusan", dateTime(a.decidedAt)],
    ["Jalur", a.decidedVia ? VIA_LABEL[a.decidedVia] ?? a.decidedVia : "-"],
    ["Alasan / catatan", text(a.reasonDecided)],
    ["Pelaksanaan", EXECUTION_STATUS_LABEL[a.executionStatus] ?? a.executionStatus],
    ["Waktu pelaksanaan", dateTime(a.executedAt)],
    ["Percobaan pelaksanaan", String(a.executionAttempts)],
    ["Kesalahan pelaksanaan", text(a.executionError)],
    ["Tanda tinjauan", a.reviewState ? `${REVIEW_STATE_LABEL[a.reviewState] ?? a.reviewState}: ${text(a.reviewNote)}` : "-"],
  ], 0.3);
  if (!final) {
    w.paragraph(
      a.status === "pending"
        ? "Belum ada keputusan. Dokumen ini hanya draf pemeriksaan."
        : "Keputusan tercatat, tetapi pelaksanaan belum terverifikasi berhasil. \"Disetujui\" ≠ \"berhasil\".",
      { bold: true, color: PDF_RED },
    );
  }

  w.section("I. Tindak lanjut");
  w.paragraph(ex.followUp.length ? ex.followUp.join("\n") : "Tidak ada tindak lanjut tercatat.");

  w.section("J. Timeline & dokumentasi (audit log, WIB)");
  w.table(
    [
      { label: "Waktu", width: 18 },
      { label: "Peristiwa", width: 42 },
      { label: "Oleh", width: 22 },
      { label: "Status", width: 18 },
    ],
    d.timeline.map((t) => [dateTime(t.time), text(t.action), text(t.actor), text(t.status)]),
    { empty: "Belum ada catatan audit untuk pengajuan ini." },
  );

  w.section("Metadata audit", "portrait", "Untuk verifikasi: sidik dihitung ulang dari data sumber saat PDF dibuat.");
  w.keyValues([
    ["ID pengajuan", a.id],
    ["Sidik data sumber (SHA-256)", d.snapshotHash],
    ["Data diperiksa", dateTime(d.checkedAt)],
    ["Status dokumen", final ? "Final" : "Draf"],
  ], 0.35);
  return w.finish();
}
