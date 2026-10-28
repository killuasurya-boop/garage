// =============================================================================
// B7b — PDF resmi keuangan PRD §20.2 jenis B (harian), C (bulanan), D (kasus).
// Gaya & penulis sama dengan PDF shift resmi (jenis A, shift-accountability-pdf.ts).
// Isi = data owner-reports-build.ts apa adanya (tanpa narasi AI). Watermark DRAFT
// sampai seluruh shift terkait final Owner (2FA) / kasus diputuskan.
// =============================================================================
import {
  type CaseDossier,
  type DailyDossier,
  type MonthlyLedger,
} from "@/lib/owner-reports-build";
import { RISK_DISPOSITION_LABEL, RISK_LEVEL_LABEL, type RiskDisposition, type RiskLevel } from "@/lib/risk-rules";
import {
  OfficialPdfWriter as Writer,
  officialCover as cover,
  pdfDateTime as dateTime,
  pdfLongDate as longDate,
  pdfNum as num,
  pdfRp as rp,
  pdfText as text,
  pdfTime as time,
  PDF_MUTED,
  PDF_RED,
} from "@/lib/shift-accountability-pdf";

const FINAL_LABEL: Record<string, string> = {
  pending: "Menunggu final Owner",
  approved: "Final · disetujui",
  approved_with_exception: "Final · dengan pengecualian",
  returned: "Dikembalikan untuk koreksi",
  legacy: "Ditutup sebelum final Owner",
};
const REVIEW_LABEL: Record<string, string> = { pending: "Menunggu", verified: "Terverifikasi", needs_followup: "Perlu tindak lanjut" };
const CUSTODY_LABEL: Record<string, string> = { cashier: "Laci kasir", manager: "Pemeriksa/Manajer", qris: "QRIS", bank: "Setoran bank", system: "Sistem" };
const pct = (value: number | null) => (value === null ? "-" : `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`);
const signed = (value: number | null) => (value === null ? "-" : value === 0 ? "Rp 0" : `${value > 0 ? "+" : ""}${rp(value)}`);
const levelLabel = (level: number) => RISK_LEVEL_LABEL[level as RiskLevel] ?? `LV${level}`;
const dispositionLabel = (value: string) => RISK_DISPOSITION_LABEL[value as RiskDisposition] ?? value;

function unavailableSection(w: Writer, items: Array<{ label: string; reason: string }>) {
  w.section("Data yang belum tercatat di sistem", "portrait", "Ditampilkan apa adanya — BUKAN berarti nol atau bersih.");
  w.keyValues(items.map((item) => [item.label, item.reason]), 0.4);
}

function auditMeta(w: Writer, rows: Array<[string, string]>) {
  w.section("Metadata audit", "portrait", "Untuk verifikasi keaslian dokumen. Total & status dari snapshot/buku kas, bukan narasi.");
  w.keyValues(rows, 0.35);
}

// ── B. Harian (CLOSING) ─────────────────────────────────────────────────────

export async function renderDailyClosingPdf(d: DailyDossier) {
  const w = new Writer(`Closing harian · ${d.date}`);
  w.watermark = d.meta.final ? null : "DRAFT · BELUM FINAL OWNER";

  // 1. Cover
  cover(w, "Laporan Closing Harian (Owner 360)", longDate(d.date), [
    ["Outlet", text(d.outletName)],
    ["Tanggal operasional", d.date],
    ["Jumlah shift", num(d.shifts.length)],
    ["Status", d.statusLabel],
    ["Versi", `V${String(d.meta.version).padStart(2, "0")}`],
    ["Report ID", d.meta.reportId],
    ["Kelengkapan data", `${d.completeness.done}/${d.completeness.total} pemeriksaan lengkap`],
  ]);

  // 2. Executive summary
  w.section("Ringkasan eksekutif");
  const s = d.summary;
  w.cards([
    ["Kas seharusnya", rp(s.expected)],
    ["Kas fisik (hitungan sah)", rp(s.actual)],
    ["Kurang (tidak dinetkan)", rp(s.shortage), s.shortage ? "bad" : undefined],
    ["Lebih (tetap pengecualian)", rp(s.surplus), s.surplus ? "warn" : undefined],
    ["Penjualan bersih", rp(s.netSales)],
    ["QRIS tercatat", rp(s.qris)],
    ["Setoran belum dikonfirmasi", rp(s.depositPending), s.depositPending ? "warn" : undefined],
    ["Alert terbuka / kasus terbuka", `${num(s.openAlerts)} / ${num(s.openCases)}`, s.openAlerts || s.openCases ? "warn" : undefined],
  ]);
  w.keyValues([
    ["Status final shift", `${num(s.approval.final)} final (${num(s.approval.withException)} dengan pengecualian) · ${num(s.approval.pending)} menunggu · ${num(s.approval.returned)} dikembalikan · ${num(s.approval.legacy)} lama`],
    ["Uang masuk / keluar (semua tender)", `${rp(d.strip.moneyIn)} / ${rp(d.strip.moneyOut)}`],
    ["Pengecualian terbesar", d.strip.topExceptions.map((e) => `${e.shiftCode} (${e.cashierName ?? "-"}): ${e.label}`).join(" · ") || "Tidak ada"],
  ]);

  // 3. Cash position
  w.section("Posisi kas per shift", "landscape", "Hitungan sah = #1, atau #3 bila #1 ≠ #2. Hitung ulang pemeriksa ditampilkan terpisah, tidak menimpa.");
  w.table(
    [
      { label: "Shift", width: 10 },
      { label: "Kasir", width: 12 },
      { label: "Buka – Tutup", width: 11 },
      { label: "Seharusnya", width: 10, align: "right" },
      { label: "Hitungan #1", width: 9, align: "right" },
      { label: "Hitungan #2", width: 9, align: "right" },
      { label: "Hitungan #3", width: 9, align: "right" },
      { label: "Sah", width: 9, align: "right" },
      { label: "Selisih", width: 9, align: "right" },
      { label: "Pemeriksa", width: 9, align: "right" },
      { label: "Final Owner", width: 13 },
    ],
    d.shifts.map((sh) => [
      `${sh.shiftNumber} · ${sh.code}`,
      text(sh.cashierName),
      `${time(sh.openedAt)} – ${sh.closedAt ? time(sh.closedAt) : "berlangsung"}`,
      rp(sh.expected),
      rp(sh.count1),
      rp(sh.count2),
      rp(sh.count3),
      rp(sh.actual),
      signed(sh.variance),
      sh.recountCash === null ? "-" : rp(sh.recountCash),
      FINAL_LABEL[sh.finalStatus] ?? sh.finalStatus,
    ]),
    { empty: "Tidak ada shift di tanggal ini." },
  );
  w.section("Penjelasan selisih (komposisi kas seharusnya)", "landscape");
  w.table(
    [
      { label: "Shift", width: 10 },
      { label: "Modal", width: 8, align: "right" },
      { label: "Jual tunai", width: 9, align: "right" },
      { label: "Kas masuk", width: 8, align: "right" },
      { label: "Kas keluar", width: 8, align: "right" },
      { label: "Refund/void", width: 8, align: "right" },
      { label: "Biaya Finance", width: 8, align: "right" },
      { label: "Koreksi metode", width: 8, align: "right" },
      { label: "Lain", width: 7, align: "right" },
      { label: "Seharusnya", width: 9, align: "right" },
      { label: "#2 − #1", width: 7, align: "right" },
      { label: "Setor", width: 8, align: "right" },
    ],
    d.variance.map((v) => [
      v.shiftCode,
      rp(v.openingCash),
      rp(v.cashSales),
      rp(v.cashIn),
      rp(-v.cashOut),
      rp(-v.cashRefundsVoids),
      rp(-v.financeCashOut),
      signed(v.methodCorrections),
      signed(v.otherAdjustments),
      rp(v.expected),
      signed(v.count1vs2),
      rp(v.deposit),
    ]),
  );

  // 4. Custody
  w.section("Peta penguasaan uang (custody)", "portrait", "Di mana uang berada & siapa pemegangnya pada akhir tanggal operasional.");
  w.table(
    [
      { label: "Posisi", width: 30 },
      { label: "Nilai", width: 14, align: "right" },
      { label: "Pemegang", width: 18 },
      { label: "Keterangan", width: 38 },
    ],
    d.custody.map((c) => [c.label, rp(c.amount), c.holder, `${c.note}${c.verified ? "" : " · belum terverifikasi"}`]),
  );
  w.table(
    [
      { label: "Ref", width: 16 },
      { label: "Penyetor", width: 16 },
      { label: "Rekening", width: 12 },
      { label: "Nilai", width: 12, align: "right" },
      { label: "Status", width: 44 },
    ],
    d.deposits.map((dep) => [
      text(dep.refNo),
      text(dep.depositorName),
      text(dep.account),
      rp(dep.amount),
      dep.confirmedAt ? `Diterima ${dateTime(dep.confirmedAt)} oleh ${text(dep.confirmedByName)} · bukti ${text(dep.bankRef)}` : "Dalam perjalanan — belum dikonfirmasi penerima",
    ]),
    { empty: "Tidak ada setoran dari shift tanggal ini." },
  );

  // 5–7. QRIS & tender
  w.section("Tender & QRIS");
  w.keyValues([
    ["Penjualan kotor / bersih", `${rp(s.grossSales)} / ${rp(s.netSales)}`],
    ["Tunai / QRIS / Transfer / Lainnya", `${rp(s.cashSales)} / ${rp(s.qris)} / ${rp(s.transfer)} / ${rp(s.otherNonCash)}`],
    ["Transaksi lunas · void · refund", `${num(s.paidCount)} · ${num(s.voidCount)} · ${rp(s.refundTotal)}`],
    ["Shift QRIS belum dicocokkan", num(s.qrisUnchecked)],
    ["Total beda QRIS tercatat vs dicocokkan", rp(s.qrisMismatch)],
    ["QRIS settled dari provider", "Belum tersedia (QRIS statis, D-06)"],
  ]);

  // 8. Risiko
  w.section("Alert risiko & kasus", "landscape", "Tingkat risiko = prioritas pemeriksaan, bukan kesimpulan kesalahan seseorang.");
  w.table(
    [
      { label: "Level", width: 9 },
      { label: "Aturan", width: 12 },
      { label: "Judul", width: 26 },
      { label: "Shift", width: 10 },
      { label: "Pihak terkait", width: 14 },
      { label: "Area", width: 10 },
      { label: "Status", width: 13 },
      { label: "Pemeriksa", width: 10 },
    ],
    d.alerts.map((a) => [
      levelLabel(a.riskLevel),
      a.ruleId,
      a.title,
      text(a.sessionCode),
      `${text(a.personName)}${a.personRole ? ` (${a.personRole})` : ""}`,
      CUSTODY_LABEL[a.custodyScope] ?? a.custodyScope,
      dispositionLabel(a.disposition),
      text(a.reviewerName),
    ]),
    { empty: "Tidak ada alert risiko untuk tanggal ini." },
  );
  w.table(
    [
      { label: "Kasus", width: 30 },
      { label: "Status", width: 15 },
      { label: "Tingkat", width: 12 },
      { label: "Dibuka", width: 18 },
      { label: "Diselesaikan", width: 18 },
    ],
    d.cases.map((c) => [c.title, c.status, c.severity, dateTime(c.createdAt), dateTime(c.resolvedAt)]),
    { empty: "Tidak ada kasus terkait." },
  );

  // 9. Month-to-date
  if (d.monthToDate) {
    const m = d.monthToDate;
    w.section(`Bulan berjalan (${m.from} s/d ${m.to})`, "portrait", "Kurang & lebih dijumlah terpisah — tidak saling menutup.");
    w.cards([
      ["Shift ditutup", num(m.shifts)],
      ["Shift berselisih", num(m.shiftsWithVariance), m.shiftsWithVariance ? "warn" : undefined],
      ["Total kurang", rp(m.shortage), m.shortage ? "bad" : undefined],
      ["Total lebih", rp(m.surplus), m.surplus ? "warn" : undefined],
    ]);
  }

  // 10. Keputusan Owner
  w.section("Keputusan final Owner", "landscape", "FINAL CLOSING mengesahkan catatan (boleh dengan pengecualian); bukan keputusan kasus & bukan otorisasi potongan gaji.");
  w.table(
    [
      { label: "Report ID", width: 18 },
      { label: "Versi", width: 6 },
      { label: "Keputusan", width: 16 },
      { label: "Pengecualian", width: 32 },
      { label: "Catatan", width: 16 },
      { label: "Oleh · waktu", width: 16 },
    ],
    d.snapshots.map((snap) => [
      snap.reportId,
      `V${String(snap.version).padStart(2, "0")}`,
      FINAL_LABEL[snap.finalStatus] ?? snap.finalStatus,
      snap.exceptions.join(" · ") || "-",
      text(snap.note),
      `${text(snap.decidedByName)} · ${dateTime(snap.decidedAt)}`,
    ]),
    { empty: "Belum ada keputusan final Owner untuk shift tanggal ini." },
  );

  // 11. Lampiran: timeline + kelengkapan
  w.section("Lampiran · Timeline (WIB)", "landscape");
  w.table(
    [
      { label: "Waktu", width: 12 },
      { label: "Peristiwa", width: 52 },
      { label: "Oleh", width: 16 },
      { label: "Nilai", width: 10, align: "right" },
      { label: "Ref", width: 10 },
    ],
    d.timeline.map((t) => [dateTime(t.at), t.label, text(t.by), t.amount === null ? "-" : rp(t.amount), text(t.ref)]),
    { empty: "Tidak ada peristiwa.", fontSize: 7 },
  );
  w.section("Lampiran · Kelengkapan data", "portrait");
  w.table(
    [
      { label: "Shift / Ref", width: 25 },
      { label: "Pemeriksaan", width: 50 },
      { label: "Status", width: 25 },
    ],
    d.completeness.items.map((c) => [c.shiftCode, c.label, c.ok ? "Lengkap" : "BELUM"]),
    { empty: "Tidak ada pemeriksaan (belum ada shift ditutup)." },
  );
  unavailableSection(w, d.unavailable);

  // 12. Metadata
  auditMeta(w, [
    ["Report ID", d.meta.reportId],
    ["Versi", `V${String(d.meta.version).padStart(2, "0")}`],
    ["Hash ringkasan (SHA-256)", d.meta.hash],
    ["Status dokumen", d.meta.final ? "FINAL — semua shift disahkan Owner dengan 2FA" : "DRAFT — belum semua shift final Owner"],
    ["Snapshot final shift", d.snapshots.map((snap) => `${snap.reportId} (${snap.summaryHash.slice(0, 12)}…)`).join(", ") || "-"],
    ["Dibuat", dateTime(d.meta.generatedAt)],
  ]);
  return w.finish();
}

// ── C. Bulanan (FINANCIAL AUDIT) ────────────────────────────────────────────

export async function renderMonthlyAuditPdf(m: MonthlyLedger) {
  const w = new Writer(`Audit keuangan · ${m.from} s/d ${m.to}`);
  w.watermark = m.meta.final ? null : "DRAFT · ADA SHIFT BELUM FINAL";
  const t = m.totals;
  cover(w, "Laporan Audit Keuangan Bulanan", `${longDate(m.from)} — ${longDate(m.to)}`, [
    ["Outlet", text(m.outletName)],
    ["Periode", `${m.from} s/d ${m.to}`],
    ["Shift (ditutup / semua)", `${num(t.closedShifts)} / ${num(t.shifts)}`],
    ["Report ID", m.meta.reportId],
  ]);

  w.section("Ringkasan akuntabilitas", "portrait", "Kurang & lebih TIDAK dinetkan. Lebih bukan pendapatan dan tetap pengecualian.");
  w.cards([
    ["Kas tunai ditangani", rp(t.cashHandled)],
    ["Total kurang", rp(t.shortage), t.shortage ? "bad" : undefined],
    ["Total lebih", rp(t.surplus), t.surplus ? "warn" : undefined],
    ["Rasio kurang / kas", pct(t.shortageRate)],
    ["Shift berselisih", `${num(t.shiftsWithVariance)} (${pct(t.varianceFrequency)})`],
    ["Hitungan #3 dipakai", num(t.thirdCounts)],
    ["Tutup darurat", num(t.emergencyCloses), t.emergencyCloses ? "warn" : undefined],
    ["Koreksi metode bayar", num(t.tenderCorrections)],
  ]);
  w.keyValues([
    ["Final Owner", `${num(t.finals.approved)} disetujui · ${num(t.finals.withException)} dengan pengecualian · ${num(t.finals.pending)} menunggu · ${num(t.finals.returned)} dikembalikan · ${num(t.finals.legacy)} lama`],
    ["Diverifikasi tanpa pemeriksa kedua", num(t.selfVerified)],
  ]);

  w.section("Per tanggal operasional", "landscape");
  w.table(
    [
      { label: "Tanggal", width: 14 },
      { label: "Shift", width: 8, align: "right" },
      { label: "Seharusnya", width: 16, align: "right" },
      { label: "Fisik", width: 16, align: "right" },
      { label: "Kurang", width: 14, align: "right" },
      { label: "Lebih", width: 14, align: "right" },
      { label: "Final", width: 10, align: "right" },
    ],
    m.days.map((d) => [d.date, num(d.shifts), rp(d.expected), rp(d.actual), rp(d.shortage), rp(d.surplus), `${num(d.final)}/${num(d.shifts)}`]),
    { empty: "Tidak ada shift ditutup pada periode ini.", totals: ["TOTAL", num(t.closedShifts), "", "", rp(t.shortage), rp(t.surplus), ""] },
  );

  w.section("Per kasir", "landscape", "Frekuensi = shift berselisih ÷ shift kasir itu sendiri; rasio = kurang ÷ kas yang ditangani. Bukan peringkat atau vonis.");
  w.table(
    [
      { label: "Kasir", width: 16 },
      { label: "Shift", width: 7, align: "right" },
      { label: "Berselisih", width: 10, align: "right" },
      { label: "Frekuensi", width: 9, align: "right" },
      { label: "Kurang", width: 12, align: "right" },
      { label: "Lebih", width: 12, align: "right" },
      { label: "Kas ditangani", width: 14, align: "right" },
      { label: "Rasio kurang", width: 9, align: "right" },
      { label: "#3 / darurat", width: 9, align: "right" },
    ],
    m.cashiers.map((c) => [c.name, num(c.shifts), num(c.shiftsWithVariance), pct(c.frequency), rp(c.shortage), rp(c.surplus), rp(c.cashHandled), pct(c.shortageRate), `${num(c.thirdCounts)} / ${num(c.emergencyCloses)}`]),
    { empty: "Tidak ada data kasir." },
  );

  w.section("Pemeriksa & setoran (dipisah dari kasir)", "landscape");
  w.table(
    [
      { label: "Pemeriksa", width: 25 },
      { label: "Diperiksa", width: 15, align: "right" },
      { label: "Hitung ulang", width: 15, align: "right" },
      { label: "Hitung ulang ≠ kasir", width: 20, align: "right" },
      { label: "Tanpa pemeriksa kedua", width: 25, align: "right" },
    ],
    m.reviewers.map((r) => [r.name, num(r.reviewed), num(r.recounts), num(r.recountDiffers), num(r.selfVerified)]),
    { empty: "Belum ada pemeriksaan Manajer." },
  );
  w.table(
    [
      { label: "Penyetor", width: 30 },
      { label: "Jumlah setoran", width: 20, align: "right" },
      { label: "Nilai", width: 25, align: "right" },
      { label: "Belum dikonfirmasi", width: 25, align: "right" },
    ],
    m.depositors.map((d) => [d.name, num(d.deposits), rp(d.amount), rp(d.unconfirmed)]),
    { empty: "Tidak ada setoran pada periode ini." },
  );

  w.section("Alert risiko per level", "portrait", "Terbukti = disposisi Owner berdasarkan bukti; Bukan masalah = false positive.");
  w.table(
    [
      { label: "Level", width: 22 },
      { label: "Total", width: 12, align: "right" },
      { label: "Terbuka", width: 12, align: "right" },
      { label: "Terbukti", width: 12, align: "right" },
      { label: "Bukan masalah", width: 14, align: "right" },
      { label: "Dijelaskan/ditutup", width: 16, align: "right" },
      { label: "Disanggah", width: 12, align: "right" },
    ],
    m.risk.map((r) => [levelLabel(r.level), num(r.total), num(r.open), num(r.substantiated), num(r.falsePositive), num(r.explained), num(r.disputed)]),
  );

  w.section("Saldo kasus (roll-forward)", "portrait", "Awal + baru − selesai − ditutup = akhir. Keputusan kasus terpisah dari final closing.");
  w.keyValues([
    ["Kasus terbuka awal periode", num(m.cases.openingBalance)],
    ["Kasus baru", num(m.cases.opened)],
    ["Selesai diputuskan", num(m.cases.resolved)],
    ["Ditutup (tidak terbukti/bukan masalah)", num(m.cases.dismissed)],
    ["Kasus terbuka akhir periode", num(m.cases.closingBalance), true],
  ]);
  w.table(
    [
      { label: "Kasus", width: 40 },
      { label: "Status", width: 15 },
      { label: "Tingkat", width: 12 },
      { label: "Dibuka", width: 16 },
      { label: "Selesai", width: 17 },
    ],
    m.cases.list.map((c) => [c.title, c.status, c.severity, dateTime(c.createdAt), dateTime(c.resolvedAt)]),
    { empty: "Tidak ada kasus aktif pada periode ini." },
  );
  unavailableSection(w, m.unavailable);
  auditMeta(w, [
    ["Report ID", m.meta.reportId],
    ["Hash ringkasan (SHA-256)", m.meta.hash],
    ["Status dokumen", m.meta.final ? "FINAL — semua shift periode ini final Owner" : "DRAFT — masih ada shift belum final Owner"],
    ["Dibuat", dateTime(m.meta.generatedAt)],
  ]);
  return w.finish();
}

// ── D. Kasus ────────────────────────────────────────────────────────────────

export async function renderCasePdf(c: CaseDossier) {
  const w = new Writer(`Kasus ${c.code}`);
  w.watermark = c.meta.final ? null : "KASUS TERBUKA · BELUM ADA KESIMPULAN";
  cover(w, "Laporan Kasus Pemeriksaan", c.case.title, [
    ["Kode kasus", c.code],
    ["Status", c.case.statusLabel],
    ["Tingkat", c.case.severity],
    ["Jenis", c.case.flagKind],
    ["Pihak terkait (bukan vonis)", text(c.case.actorName)],
    ["Ditugaskan ke", text(c.case.assignedToName)],
    ["Dibuka", `${dateTime(c.case.createdAt)} oleh ${text(c.case.createdByName)}`],
    ["Selesai", dateTime(c.case.resolvedAt)],
  ]);
  w.section("Uraian");
  w.paragraph(c.case.description ?? "-");
  w.doc.moveDown(0.4);
  w.paragraph(
    "Kasus adalah proses pemeriksaan. Tingkat risiko menunjukkan prioritas pemeriksaan, bukan kesimpulan. Keputusan kasus terpisah dari final closing dan dari otorisasi potongan gaji (PRD §13.5).",
    { color: PDF_MUTED, size: 7.5 },
  );

  w.section("Kronologi (WIB)", "landscape");
  w.table(
    [
      { label: "Waktu", width: 16 },
      { label: "Peristiwa", width: 64 },
      { label: "Oleh", width: 20 },
    ],
    c.timeline.map((t) => [dateTime(t.at), t.label, text(t.by)]),
  );

  w.section("Alert & bukti", "landscape");
  w.table(
    [
      { label: "Level", width: 10 },
      { label: "Aturan", width: 12 },
      { label: "Penjelasan", width: 42 },
      { label: "Kelengkapan", width: 10 },
      { label: "Disposisi", width: 14 },
      { label: "Pemeriksa", width: 12 },
    ],
    c.alerts.map((a) => [levelLabel(a.riskLevel), a.ruleId, a.explanation, a.completeness === "complete" ? "Lengkap" : "Sebagian", dispositionLabel(a.disposition), text(a.reviewerName)]),
    { empty: "Kasus tidak berasal dari alert risiko." },
  );
  w.table(
    [
      { label: "Jenis bukti", width: 18 },
      { label: "Referensi", width: 32 },
      { label: "Keterangan", width: 50 },
    ],
    c.evidence.map((e) => [e.type, e.ref, e.label]),
    { empty: "Tidak ada referensi bukti terlampir." },
  );

  w.section("Shift terkait", "landscape");
  w.table(
    [
      { label: "Shift", width: 16 },
      { label: "Tanggal", width: 12 },
      { label: "Kasir", width: 16 },
      { label: "Seharusnya", width: 13, align: "right" },
      { label: "Fisik", width: 13, align: "right" },
      { label: "Selisih", width: 12, align: "right" },
      { label: "Pemeriksaan", width: 9 },
      { label: "Final Owner", width: 9 },
    ],
    c.sessions.map((s) => [s.code, s.date, text(s.cashierName), rp(s.expected), rp(s.actual), signed(s.variance), REVIEW_LABEL[s.reviewStatus] ?? s.reviewStatus, FINAL_LABEL[s.finalStatus] ?? s.finalStatus]),
    { empty: "Tidak ada shift terkait." },
  );

  w.section("Tanggapan & catatan pemeriksa");
  w.table(
    [
      { label: "Waktu", width: 18 },
      { label: "Oleh", width: 18 },
      { label: "Catatan", width: 64 },
    ],
    c.case.notes.map((n) => [dateTime(n.at), n.byName, n.text]),
    { empty: "Belum ada catatan." },
  );

  w.section("Keputusan");
  w.paragraph(c.meta.final ? c.case.statusLabel : "Belum ada keputusan — kasus masih terbuka.", { bold: true, color: c.meta.final ? undefined : PDF_RED });
  auditMeta(w, [
    ["Report ID", c.meta.reportId],
    ["Hash ringkasan (SHA-256)", c.meta.hash],
    ["Dibuat", dateTime(c.meta.generatedAt)],
  ]);
  return w.finish();
}
