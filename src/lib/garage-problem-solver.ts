/**
 * Garage OS / AYA — Smart Problem Solver V4 (baca-saja).
 * Owner menyampaikan masalah → pilih tool R0 resmi (daftar putih) → kumpulkan bukti deterministik →
 * uji hipotesis berbasis aturan → susun laporan keputusan. Tidak ada persetujuan, perubahan data,
 * atau eksekusi di sini. Output tool = DATA tak tepercaya (bukan instruksi).
 */
export type SolverMode = "quick" | "full";
export type SolverDomain = "dashboard" | "pos" | "shift_kas" | "keuangan" | "gudang" |
  "dapur_bar" | "produk_harga" | "bahan_resep" | "marketing" | "karyawan" |
  "meja_qr" | "event" | "sistem";
export type SourceProbe = { tool: string; domain: SolverDomain; args: Record<string, string | number | boolean>; limit?: number };
/** Fakta terukur dari satu sumber (angka nyata, bukan tafsiran). */
export type SolverMetric = { key: string; label: string; value: number; unit?: "rupiah" | "item" | "kali" };
export type SolverEvidence = { tool: string; domain: SolverDomain; checkedAt: string; dataAsOf: string | null;
  status: "available" | "unavailable"; recordCount: number | null; truncated: boolean; excerpt: unknown;
  facts: string[]; metrics: SolverMetric[]; error?: string; errorRef?: string };
export type HypothesisSupport = "didukung" | "lemah" | "tidak_didukung" | "belum_diuji";
export type SolverHypothesis = { id: string; text: string; support: HypothesisSupport; evidence: string[]; howToProve: string };
export type ProposedAction = { step: number; title: string; explanation: string; risk: "R0" | "R1" | "R2" | "R3";
  execution: "draft_only"; toolCandidate?: string; confirmationRequired: boolean };
export type SolverOption = { id: string; title: string; consequence: string; risk: "R0" | "R1" | "R2" | "R3"; recommended: boolean };
export type SolverReport = {
  masalah: string; fakta: string[]; dugaan: SolverHypothesis[]; belumDiketahui: string[]; akarMasalah: string;
  dampak: string[]; opsi: SolverOption[]; rekomendasi: string; eksekusi: "BELUM_DILAKUKAN"; hasil: "BELUM_ADA";
  bukti: Array<{ tool: string; checkedAt: string; dataAsOf: string | null; status: string; ref?: string }>;
};
export type ProblemDiagnosis = { version: "4.1"; input: string; generatedAt: string; mode: SolverMode;
  domains: SolverDomain[]; evidence: SolverEvidence[];
  analysis: { status: "EVIDENCE_READY" | "NEED_REVIEW" | "DATA_UNAVAILABLE"; whatHappened: string;
    verifiedFacts: string[]; hypotheses: string[]; missingEvidence: string[]; confidence: "LOW" | "PRELIMINARY";
    recommendation: string; reasons: string[]; risks: string[] };
  hypotheses: SolverHypothesis[];
  report: SolverReport;
  proposedActions: ProposedAction[]; ownerDecision: "NOT_DECIDED"; executionStatus: "NOT_EXECUTED" };

/** Daftar putih baca-saja. Nama tool TIDAK PERNAH diambil dari input user atau model. */
export const READ_PROBES: SourceProbe[] = [
  { tool: "ringkasan_hari_ini", domain: "dashboard", args: {} },
  { tool: "daftar_order", domain: "pos", args: { limit: 30, status: "all" }, limit: 30 },
  { tool: "rekap_kas_harian", domain: "shift_kas", args: {} },
  { tool: "pengawasan_kas", domain: "shift_kas", args: {} },
  { tool: "daftar_approval", domain: "keuangan", args: { status: "pending" } },
  { tool: "garage_list_anomaly_cases", domain: "keuangan", args: { status: "OPEN", limit: 15 }, limit: 15 },
  { tool: "daftar_menu", domain: "produk_harga", args: {} },
  { tool: "margin_menu", domain: "bahan_resep", args: {} },
  { tool: "cek_stok_bahan", domain: "gudang", args: { hanyaMenipis: true }, limit: 60 },
  { tool: "rekomendasi_opname", domain: "gudang", args: {}, limit: 30 },
  { tool: "status_operasional", domain: "dapur_bar", args: {} },
  { tool: "ringkasan_marketing", domain: "marketing", args: {} },
  { tool: "status_meja", domain: "meja_qr", args: {} },
  { tool: "daftar_staf", domain: "karyawan", args: {} },
  { tool: "daftar_event", domain: "event", args: {} },
];
export const PROBE_TIMEOUT_MS = 8000;
const MATCH: Array<[SolverDomain, RegExp]> = [
  ["pos", /\b(pos|order|transaksi|diskon|refund|void|struk|kasir|checkout|dobel|duplikat|ganda)\b/i],
  ["shift_kas", /\b(qris|cash|tunai|laci|kas|petty|shift|setoran|bank|saldo|selisih)\b/i],
  ["keuangan", /\b(keuangan|approval|approv|persetujuan|biaya|pengeluaran|closing|laba|rugi|fraud|anomali)\b/i],
  ["produk_harga", /\b(menu|harga|produk|kategori|varian)\b/i],
  ["bahan_resep", /\b(hpp|resep|margin|bahan|food.cost)\b/i],
  ["gudang", /\b(wms|stok|stock|gudang|supplier|opname|waste|po|belanja|pembelian|kadaluarsa|kedaluwarsa|minus)\b/i],
  ["dapur_bar", /\b(bar|kitchen|dapur|produksi|koki|barista|antrean|antrian|lambat|terlambat|tiket)\b/i],
  ["karyawan", /\b(karyawan|staf|staff|hr|absen|gaji|peran|sop|izin|permission|akses)\b/i],
  ["marketing", /\b(marketing|promo|iklan|konten|instagram|campaign)\b/i],
  ["meja_qr", /\b(meja|table|qr|waiter)\b/i],
  ["event", /\b(event|undangan|rsvp)\b/i],
  ["sistem", /\b(sistem|mcp|bug|error|deploy|server|api|integrasi|notifikasi)\b/i],
];
export function selectProblemProbes(message: string, mode: SolverMode = "quick"): SourceProbe[] {
  if (mode === "full" || /\b(seluruh|semua|total|full.system|semua.modul)\b/i.test(message))
    return READ_PROBES;
  const chosen = new Set(MATCH.filter((entry) => entry[1].test(message)).map((entry) => entry[0]));
  if (!chosen.size) { chosen.add("dashboard"); chosen.add("keuangan"); chosen.add("dapur_bar"); }
  if (chosen.has("shift_kas")) chosen.add("pos");
  if (chosen.has("gudang")) chosen.add("dapur_bar");
  if (chosen.has("dapur_bar")) chosen.add("gudang");
  if (chosen.has("bahan_resep")) chosen.add("produk_harga");
  return READ_PROBES.filter((probe) => chosen.has(probe.domain)).slice(0, 6);
}

const SENSITIVE = /password|pin|otp|token|secret|api.?key|credential|cookie|authorization|rekening|bank.?account|phone|telepon|whatsapp|email|alamat|address|nik|ktp|birth|dob|customer.?name|staff.?name|user.?name|requester|pemohon|penerima|person.?name/i;
const PHONE = /\b(?:\+?62|0)8\d{8,12}\b/g;
const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
/** Ringkasan untuk ditampilkan ke Owner: field sensitif dibuang, nomor/email disamarkan, ukuran dibatasi. */
export function safeExcerpt(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[ringkasan dibatasi]";
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.replace(EMAIL, "[email disembunyikan]").replace(PHONE, "[nomor disembunyikan]").slice(0, 180);
  if (Array.isArray(value)) return { total: value.length, contoh: value.slice(0, 3).map((item) => safeExcerpt(item, depth + 1)) };
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE.test(key)).slice(0, 16)
    .map(([key, val]) => [key, safeExcerpt(val, depth + 1)]));
}

/** Kunci yang boleh dikirim ke provider AI eksternal (daftar putih, keputusan Owner 6 Nov 2026). */
const AI_SAFE_KEY = /^(id|sku|kode|code|status|kategori|category|tanggal|date|periode|period|from|to|jumlah|count|total|nominal|amount|amountValue|risk|risiko|riskTier|level|stok|minimum|satuan|unit|hpp|margin|marginPct|qty|station|stations|queue|alerts|live|summary|byStatus|over|short|openItems|transactions|gross|netSales|voidCount|voidValue|refundCount|averageTicket|itemsSold|severity|label|type|tipe|executionStatus|tier)$/i;
/** Hanya angka, boolean, dan teks pendek dari kunci daftar putih. Tanpa nama orang/kontak/teks bebas. */
export function aiSafeExcerpt(value: unknown, depth = 0, key = ""): unknown {
  if (depth > 3) return undefined;
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (depth > 0 && !AI_SAFE_KEY.test(key)) return undefined;
    const clean = value.replace(EMAIL, "[email]").replace(PHONE, "[nomor]");
    return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
  }
  if (Array.isArray(value)) return { total: value.length, contoh: value.slice(0, 3).map((item) => aiSafeExcerpt(item, depth + 1, key)) };
  if (typeof value !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (SENSITIVE.test(k)) continue;
    const next = aiSafeExcerpt(v, depth + 1, k);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

// ─── Ekstraksi fakta deterministik per tool ────────────────────────────────
const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : null);

type Extracted = { facts: string[]; metrics: SolverMetric[] };
function metric(out: Extracted, key: string, label: string, value: number, unit?: SolverMetric["unit"], fact?: string) {
  out.metrics.push({ key, label, value, unit });
  out.facts.push(fact ?? `${label}: ${unit === "rupiah" ? rupiah(value) : value.toLocaleString("id-ID")}.`);
}

export function extractFacts(tool: string, value: unknown): Extracted {
  const out: Extracted = { facts: [], metrics: [] };
  const o = obj(value);
  const a = arr(value);
  switch (tool) {
    case "ringkasan_hari_ini": {
      const s = obj(o?.penjualan);
      if (s) {
        if (num(s.gross) !== null) metric(out, "omzet", "Omzet kotor hari ini", num(s.gross)!, "rupiah");
        if (num(s.transactions) !== null) metric(out, "transaksi", "Transaksi lunas hari ini", num(s.transactions)!, "kali");
        if (num(s.voidCount)) metric(out, "void", "Order dibatalkan (void) hari ini", num(s.voidCount)!, "kali");
        if (num(s.refundCount)) metric(out, "refund", "Order direfund hari ini", num(s.refundCount)!, "kali");
      }
      break;
    }
    case "daftar_order": {
      if (a) {
        const pending = a.filter((row) => ["pending_cashier", "awaiting_payment", "accepted", "pending"].includes(String(row.status)));
        metric(out, "order_dibaca", "Order terbaru yang dibaca", a.length, "item");
        if (pending.length) metric(out, "order_belum_lunas", "Order belum lunas di daftar", pending.length, "item");
        const keys = new Map<string, number>();
        for (const row of a) {
          const k = `${row.tableLabel ?? row.table ?? ""}|${row.total ?? ""}|${String(row.createdAt ?? "").slice(0, 16)}`;
          keys.set(k, (keys.get(k) ?? 0) + 1);
        }
        const dup = [...keys.values()].filter((n) => n > 1).length;
        if (dup) metric(out, "order_mirip", "Kelompok order dengan meja, total & menit yang sama", dup, "item");
      }
      break;
    }
    case "pengawasan_kas": {
      const summary = obj(o?.summary);
      const queues = obj(o?.queues);
      if (summary) {
        if (num(summary.short)) metric(out, "kas_kurang", "Total kas kurang pada periode", num(summary.short)!, "rupiah");
        if (num(summary.over)) metric(out, "kas_lebih", "Total kas lebih pada periode", num(summary.over)!, "rupiah");
        if (num(summary.openItems) !== null) metric(out, "kas_antrean", "Item kontrol kas yang masih terbuka", num(summary.openItems)!, "item");
      }
      if (queues) {
        const qris = arr(queues.qris_mismatch)?.length ?? 0;
        const unverified = arr(queues.discrepancy_unverified)?.length ?? 0;
        const deposit = arr(queues.deposit_unconfirmed)?.length ?? 0;
        if (qris) metric(out, "qris_beda", "Shift dengan QRIS berbeda/belum dicocokkan", qris, "item");
        if (unverified) metric(out, "selisih_belum_verifikasi", "Shift berselisih belum diverifikasi", unverified, "item");
        if (deposit) metric(out, "setoran_belum_konfirmasi", "Setoran belum dikonfirmasi masuk rekening", deposit, "item");
      }
      break;
    }
    case "rekap_kas_harian": {
      const rows = a ?? arr(o?.sessions) ?? arr(o?.items);
      if (rows) metric(out, "shift_hari_ini", "Shift kas tercatat pada tanggal itu", rows.length, "item");
      break;
    }
    case "daftar_approval": {
      if (a) {
        const pending = a.filter((row) => row.status === "pending");
        const high = pending.filter((row) => /high|tinggi|critical/i.test(String(row.risk)));
        const total = pending.reduce((sum, row) => sum + (num(row.amountValue) ?? 0), 0);
        metric(out, "approval_menunggu", "Pengajuan menunggu", pending.length, "item");
        if (high.length) metric(out, "approval_risiko_tinggi", "Pengajuan risiko tinggi menunggu", high.length, "item");
        if (total) metric(out, "approval_nilai", "Nilai pengajuan menunggu (yang terbaca angkanya)", total, "rupiah");
        const failed = a.filter((row) => row.executionStatus === "failed").length;
        if (failed) metric(out, "approval_gagal", "Pengajuan yang pelaksanaannya gagal", failed, "item");
      }
      break;
    }
    case "garage_list_anomaly_cases": {
      const count = num(o?.jumlah);
      if (count !== null) metric(out, "alert_terbuka", "Alert risiko terbuka (prioritas review, bukan tuduhan)", count, "item");
      break;
    }
    case "cek_stok_bahan": {
      if (a) {
        const minus = a.filter((row) => (num(row.stok) ?? 0) < 0);
        const low = a.filter((row) => (num(row.stok) ?? 0) >= 0 && (num(row.stok) ?? 0) <= (num(row.minimum) ?? 0));
        if (minus.length) metric(out, "stok_minus", "Bahan dengan stok minus", minus.length, "item",
          `Bahan stok minus: ${minus.length} (${minus.slice(0, 5).map((row) => row.sku).join(", ")}).`);
        metric(out, "stok_menipis", "Bahan di bawah/sama dengan minimum", low.length, "item");
      }
      break;
    }
    case "rekomendasi_opname": {
      if (a) metric(out, "opname_tindakan", "Rekomendasi tindak lanjut opname aktif", a.length, "item");
      break;
    }
    case "status_operasional": {
      const alerts = arr(o?.alerts);
      const queue = arr(o?.queue);
      if (alerts) metric(out, "ops_alert", "Peringatan operasional Bar/Dapur", alerts.length, "item");
      if (queue) metric(out, "ops_antrean", "Tiket dalam antrean produksi", queue.length, "item");
      const late = queue?.filter((row) => row.late === true || row.isLate === true || /terlambat|late/i.test(String(row.slaStatus ?? ""))).length ?? 0;
      if (late) metric(out, "ops_terlambat", "Tiket melewati target waktu", late, "item");
      break;
    }
    case "margin_menu": {
      const rows = a ?? arr(o?.items) ?? arr(o?.rows);
      if (rows) {
        const low = rows.filter((row) => (num(row.marginPct) ?? num(row.margin) ?? 100) < 50);
        metric(out, "menu_margin_rendah", "Menu dengan margin < 50% (HPP lengkap saja)", low.length, "item");
      }
      break;
    }
    case "status_meja": {
      const rows = a ?? arr(o?.tables) ?? arr(o?.rows);
      if (rows) {
        const stale = rows.filter((row) => row.staleFromPreviousDay === true).length;
        if (stale) metric(out, "meja_tagihan_kemarin", "Meja dengan tagihan belum bayar dari hari sebelumnya", stale, "item");
      }
      break;
    }
    default:
      break;
  }
  if (!out.facts.length) {
    const count = a ? a.length : num(o?.jumlah);
    out.facts.push(count !== null && count !== undefined ? `Sumber terbaca: ${count} baris.` : "Sumber terbaca; belum ada ukuran angka khusus untuk sumber ini.");
  }
  return out;
}

/** Kompatibilitas: daftar kalimat fakta. */
export function summarizeFacts(tool: string, value: unknown): string[] {
  return extractFacts(tool, value).facts;
}

// ─── Uji hipotesis berbasis aturan ─────────────────────────────────────────
function metricOf(evidence: SolverEvidence[], key: string) {
  for (const row of evidence) {
    const found = row.metrics.find((m) => m.key === key);
    if (found) return { value: found.value, tool: row.tool };
  }
  return null;
}

export function testHypotheses(domains: SolverDomain[], evidence: SolverEvidence[]): SolverHypothesis[] {
  const out: SolverHypothesis[] = [];
  const add = (id: string, text: string, support: HypothesisSupport, ev: Array<{ tool: string } | null>, howToProve: string) =>
    out.push({ id, text, support, evidence: ev.filter(Boolean).map((e) => e!.tool), howToProve });
  const has = (d: SolverDomain) => domains.includes(d);
  const read = (tool: string) => evidence.some((row) => row.tool === tool && row.status === "available");

  if (has("shift_kas")) {
    const qris = metricOf(evidence, "qris_beda");
    const unverified = metricOf(evidence, "selisih_belum_verifikasi");
    add("H-QRIS", "Selisih berasal dari pembayaran QRIS yang tercatat dengan metode lain atau belum dicocokkan.",
      qris ? "didukung" : read("pengawasan_kas") ? "tidak_didukung" : "belum_diuji", [qris],
      "Cocokkan struk per transaksi dengan mutasi QRIS merchant pada jam shift yang sama.");
    add("H-VERIF", "Selisih kas belum diperiksa orang kedua (verifikasi Manajer/Owner).",
      unverified ? "didukung" : read("pengawasan_kas") ? "tidak_didukung" : "belum_diuji", [unverified],
      "Buka Kontrol Kas → shift berselisih → hitung ulang & akui selisih dengan catatan.");
  }
  if (has("pos")) {
    const dup = metricOf(evidence, "order_mirip");
    add("H-DUP", "Ada order ganda (meja, total dan menit yang sama).", dup ? "lemah" : read("daftar_order") ? "tidak_didukung" : "belum_diuji", [dup],
      "Bandingkan isi item & pembayaran tiap order mirip; order ganda asli punya client request key berbeda.");
    const unpaid = metricOf(evidence, "order_belum_lunas");
    if (unpaid) add("H-UNPAID", "Sebagian order belum dibayar (Bayar nanti / QR) dan belum ditagih.", "didukung", [unpaid],
      "Buka POS → Belum Bayar; cek umur tagihan dan jalur Cash/QRIS.");
  }
  if (has("gudang")) {
    const minus = metricOf(evidence, "stok_minus");
    add("H-OVERSOLD", "Stok minus karena penjualan melebihi stok tercatat atau penerimaan belum dicatat.", minus ? "didukung" : read("cek_stok_bahan") ? "tidak_didukung" : "belum_diuji", [minus],
      "Lihat kartu stok SKU terkait: penjualan vs penerimaan; cek isu WMS 'oversold' / 'not_in_wms'.");
  }
  if (has("dapur_bar")) {
    const late = metricOf(evidence, "ops_terlambat");
    const alerts = metricOf(evidence, "ops_alert");
    add("H-SLA", "Tiket Bar/Dapur melewati target waktu pada jam sibuk.", late ? "didukung" : alerts ? "lemah" : read("status_operasional") ? "tidak_didukung" : "belum_diuji", [late, alerts],
      "Bandingkan waktu tiket masuk vs siap per station dan jumlah staf on-shift.");
  }
  if (has("keuangan")) {
    const high = metricOf(evidence, "approval_risiko_tinggi");
    const failed = metricOf(evidence, "approval_gagal");
    add("H-APPROVAL", "Pengajuan risiko tinggi menumpuk tanpa keputusan.", high ? "didukung" : read("daftar_approval") ? "tidak_didukung" : "belum_diuji", [high],
      "Buka Owner Decision Center → filter Risiko tinggi; putuskan satu per satu dengan bukti.");
    if (failed) add("H-EXEC", "Keputusan sudah diambil tetapi pelaksanaannya gagal.", "didukung", [failed],
      "Lihat alasan gagal di detail pengajuan; ulangi setelah penyebab diperbaiki.");
  }
  if (has("bahan_resep")) {
    const low = metricOf(evidence, "menu_margin_rendah");
    add("H-MARGIN", "Margin turun karena HPP bahan naik atau harga jual tidak disesuaikan.", low ? "lemah" : read("margin_menu") ? "tidak_didukung" : "belum_diuji", [low],
      "Bandingkan harga beli terakhir bahan utama dengan periode sebelumnya.");
  }
  if (!out.length) add("H-UNKNOWN", "Penyebab belum dapat ditetapkan tanpa bukti kejadian spesifik.", "belum_diuji", [],
    "Sebutkan tanggal, outlet, nomor order/shift/SKU agar pemeriksaan lebih tepat.");
  return out;
}

const ACTIONS: Partial<Record<SolverDomain, Omit<ProposedAction, "step">>> = {
  pos: { title: "Rekonsiliasi order dan pembayaran", explanation: "Cocokkan order, struk dan riwayat transaksi sebelum koreksi.", risk: "R0", execution: "draft_only", toolCandidate: "daftar_order", confirmationRequired: false },
  shift_kas: { title: "Verifikasi QRIS dan saldo kas", explanation: "Bandingkan struk, mutasi bank, buku kas dan hitungan fisik.", risk: "R2", execution: "draft_only", toolCandidate: "koreksi_metode_bayar", confirmationRequired: true },
  keuangan: { title: "Tinjau pengajuan dan pengecualian", explanation: "Cek bukti, batas wewenang dan dampak sebelum setujui/tolak.", risk: "R2", execution: "draft_only", toolCandidate: "putuskan_approval", confirmationRequired: true },
  gudang: { title: "Periksa pergerakan stok dan kebutuhan", explanation: "Cocokkan satuan, ledger, batch, penerimaan serta opname.", risk: "R1", execution: "draft_only", toolCandidate: "buat_po_dari_saran", confirmationRequired: false },
  dapur_bar: { title: "Periksa hambatan Bar dan Dapur", explanation: "Validasi SLA, tiket dan antrian per station.", risk: "R0", execution: "draft_only", toolCandidate: "status_operasional", confirmationRequired: false },
  produk_harga: { title: "Validasi perubahan harga menu", explanation: "Tinjau harga varian, HPP, dan dampak margin.", risk: "R2", execution: "draft_only", toolCandidate: "ubah_harga_varian", confirmationRequired: true },
  sistem: { title: "Audit sistem dan uji regresi", explanation: "Baca log sumber resmi, uji di staging sebelum deploy.", risk: "R0", execution: "draft_only", confirmationRequired: false },
};

const IMPACT: Partial<Record<SolverDomain, string>> = {
  shift_kas: "Uang: saldo laci/rekening bisa salah catat sampai selisih diperiksa.",
  pos: "Pelanggan & kasir: tagihan belum lunas atau order ganda memengaruhi omzet dan antrean.",
  keuangan: "Keputusan tertunda: refund/biaya/selisih menunggu dan bisa berdampak ke laporan.",
  gudang: "Stok: angka stok & HPP tidak akurat; risiko kehabisan atau beli berlebih.",
  dapur_bar: "Produksi: waktu tunggu pelanggan naik pada station yang terlambat.",
  bahan_resep: "Margin: laba per menu turun bila HPP naik tanpa penyesuaian harga.",
};

function buildOptions(domains: SolverDomain[], status: ProblemDiagnosis["analysis"]["status"]): SolverOption[] {
  if (status === "DATA_UNAVAILABLE") {
    return [
      { id: "O1", title: "Pulihkan sumber data lalu periksa ulang", consequence: "Tidak ada perubahan data; keputusan menunggu bukti.", risk: "R0", recommended: true },
      { id: "O2", title: "Periksa manual di modul terkait", consequence: "Lebih lambat, tetapi tidak bergantung pada sumber yang gagal.", risk: "R0", recommended: false },
    ];
  }
  const money = domains.some((d) => d === "shift_kas" || d === "keuangan");
  return [
    { id: "O1", title: "Periksa bukti primer dulu (baca-saja)", consequence: "Tanpa risiko; memastikan dugaan sebelum mengubah apa pun.", risk: "R0", recommended: true },
    { id: "O2", title: money ? "Siapkan koreksi resmi lewat preview + persetujuan Owner" : "Siapkan tindakan perbaikan sebagai draf",
      consequence: money ? "Mengubah catatan uang/stok; wajib preview, ACC Owner dan verifikasi 2FA untuk R3." : "Perubahan berjalan setelah ACC; hasil diverifikasi ulang.",
      risk: money ? "R3" : "R1", recommended: false },
    { id: "O3", title: "Tunda & pantau", consequence: "Tidak ada biaya sekarang, tetapi masalah bisa membesar bila benar terjadi.", risk: "R0", recommended: false },
  ];
}

export function buildProblemDiagnosis(message: string, mode: SolverMode, evidence: SolverEvidence[], now = new Date()): ProblemDiagnosis {
  const domains = [...new Set(evidence.map((row) => row.domain))];
  const ready = evidence.filter((row) => row.status === "available");
  const missing = evidence.filter((row) => row.status !== "available");
  const enough = ready.length >= 2 && missing.length === 0;
  const status: ProblemDiagnosis["analysis"]["status"] = !ready.length ? "DATA_UNAVAILABLE" : enough ? "EVIDENCE_READY" : "NEED_REVIEW";
  const hypotheses = ready.length ? testHypotheses(domains, evidence) : [];
  const supported = hypotheses.filter((h) => h.support === "didukung");
  const verifiedFacts = ready.flatMap((row) => row.facts.map((fact) => `${row.tool}: ${fact}`));
  const missingEvidence = missing.map((row) => `${row.tool}: ${row.error ?? "tidak tersedia"}${row.errorRef ? ` (ref ${row.errorRef})` : ""}`)
    .concat(ready.filter((row) => row.truncated).map((row) => `${row.tool}: hasil dibatasi ${row.recordCount} baris — bisa ada data lain.`))
    .concat(ready.filter((row) => !row.dataAsOf).map((row) => `${row.tool}: waktu data tidak tersedia (yang tercatat hanya waktu pemeriksaan).`))
    .concat(["Periksa record primer dan periode sebelum keputusan terkait uang/stok."]);
  const proposedActions = domains.map((domain) => ACTIONS[domain]).filter((action): action is NonNullable<typeof action> => Boolean(action))
    .slice(0, 5).map((action, idx) => ({ ...action, step: idx + 1 }));
  const recommendation = !ready.length
    ? "Jangan mengubah data; pulihkan akses sumber lalu periksa kembali."
    : supported.length
      ? `Periksa bukti primer untuk: ${supported.map((h) => h.text.replace(/\.$/, "")).slice(0, 2).join("; ")}. Semua tindakan perubahan masih usulan.`
      : "Tindak lanjuti pemeriksaan bukti yang relevan. Semua tindakan perubahan masih usulan.";
  const akarMasalah = status === "EVIDENCE_READY" && supported.length
    ? `Belum pasti — dugaan terkuat (didukung data): ${supported[0].text}`
    : "Belum dapat dipastikan; bukti belum cukup (NEED_REVIEW).";
  const report: SolverReport = {
    masalah: message.slice(0, 400),
    fakta: verifiedFacts,
    dugaan: hypotheses,
    belumDiketahui: missingEvidence,
    akarMasalah,
    dampak: domains.map((d) => IMPACT[d]).filter((x): x is string => Boolean(x)),
    opsi: buildOptions(domains, status),
    rekomendasi: recommendation,
    eksekusi: "BELUM_DILAKUKAN",
    hasil: "BELUM_ADA",
    bukti: evidence.map((row) => ({ tool: row.tool, checkedAt: row.checkedAt, dataAsOf: row.dataAsOf, status: row.status, ref: row.errorRef })),
  };
  return { version: "4.1", input: message, generatedAt: now.toISOString(), mode,
    domains, evidence, analysis: {
      status,
      whatHappened: message,
      verifiedFacts,
      hypotheses: hypotheses.map((h) => `${h.text} [${h.support.replace("_", " ")}]`),
      missingEvidence,
      confidence: enough ? "PRELIMINARY" : "LOW",
      recommendation,
      reasons: ["Rangkuman bersumber dari tools R0; belum merupakan persetujuan Owner.",
        "Dugaan tidak boleh diperlakukan sebagai akar masalah yang terbukti.",
        "Alert risiko adalah prioritas pemeriksaan, bukan tuduhan kepada karyawan."],
      risks: ["Data parsial atau usang dapat menghasilkan keputusan serta koreksi saldo/stok yang keliru."],
    },
    hypotheses, report,
    proposedActions, ownerDecision: "NOT_DECIDED", executionStatus: "NOT_EXECUTED" };
}

export type ReadOnlyRunner = (tool: string, args: SourceProbe["args"]) => Promise<unknown>;

function errorRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Batas waktu yang SELALU dibersihkan (tanpa timer menggantung). */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PROBE_TIMEOUT")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function investigateProblem(message: string, mode: SolverMode, read: ReadOnlyRunner, options: { timeoutMs?: number } = {}): Promise<ProblemDiagnosis> {
  const probes = selectProblemProbes(message, mode);
  const evidence: SolverEvidence[] = [];
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  for (let i = 0; i < probes.length; i += 3) {
    const rows = await Promise.all(probes.slice(i, i + 3).map(async (probe): Promise<SolverEvidence> => {
      const checkedAt = new Date().toISOString();
      try {
        const value = await withTimeout(read(probe.tool, probe.args), timeoutMs);
        const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const count = Array.isArray(value) ? value.length : typeof data.jumlah === "number" ? data.jumlah : null;
        const asOf = typeof data.dataAsOf === "string" ? data.dataAsOf : typeof data.generatedAt === "string" ? data.generatedAt : null;
        const { facts, metrics } = extractFacts(probe.tool, value);
        return { tool: probe.tool, domain: probe.domain, checkedAt, dataAsOf: asOf, status: "available", recordCount: count,
          truncated: Boolean(probe.limit && count !== null && count >= probe.limit), excerpt: safeExcerpt(value), facts, metrics };
      } catch (error) {
        // Teks error asli (bisa berisi SQL/stack) TIDAK diteruskan ke hasil atau ke provider AI — hanya ke log server.
        const ref = errorRef();
        const timeout = error instanceof Error && error.message === "PROBE_TIMEOUT";
        console.error(`[problem-solver] sumber ${probe.tool} gagal (ref ${ref})`, error);
        return { tool: probe.tool, domain: probe.domain, checkedAt, dataAsOf: null, status: "unavailable",
          recordCount: null, truncated: false, excerpt: null, facts: [], metrics: [], errorRef: ref,
          error: timeout ? `Sumber melewati batas waktu ${Math.round(timeoutMs / 1000)} detik.` : "Sumber gagal dibaca." };
      }
    }));
    evidence.push(...rows);
  }
  return buildProblemDiagnosis(message, mode, evidence);
}
