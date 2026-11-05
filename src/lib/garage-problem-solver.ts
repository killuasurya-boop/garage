/**
 * Garage OS / AYA — Smart Problem Solver V4 (read-only preview).
 * Takes Owner input, selects existing R0 MCP tools and produces evidence-first
 * decision drafts. No approval, mutation, or execution can occur here.
 */
export type SolverMode = "quick" | "full";
export type SolverDomain = "dashboard" | "pos" | "shift_kas" | "keuangan" | "gudang" |
  "dapur_bar" | "produk_harga" | "bahan_resep" | "marketing" | "karyawan" |
  "meja_qr" | "event" | "sistem";
export type SourceProbe = { tool: string; domain: SolverDomain; args: Record<string, string | number | boolean> };
export type SolverEvidence = { tool: string; domain: SolverDomain; checkedAt: string; dataAsOf: string | null;
  status: "available" | "unavailable"; recordCount: number | null; excerpt: unknown; facts: string[]; error?: string };
export type ProposedAction = { step: number; title: string; explanation: string; risk: "R0" | "R1" | "R2" | "R3";
  execution: "draft_only"; toolCandidate?: string; confirmationRequired: boolean };
export type ProblemDiagnosis = { version: "4.0-preview"; input: string; generatedAt: string; mode: SolverMode;
  domains: SolverDomain[]; evidence: SolverEvidence[];
  analysis: { status: "EVIDENCE_READY" | "NEED_REVIEW" | "DATA_UNAVAILABLE"; whatHappened: string;
    verifiedFacts: string[]; hypotheses: string[]; missingEvidence: string[]; confidence: "LOW" | "PRELIMINARY";
    recommendation: string; reasons: string[]; risks: string[] };
  proposedActions: ProposedAction[]; ownerDecision: "NOT_DECIDED"; executionStatus: "NOT_EXECUTED" };

/** Explicit read-only allowlist. Never accept tool name from model or user input. */
export const READ_PROBES: SourceProbe[] = [
  { tool: "ringkasan_hari_ini", domain: "dashboard", args: {} },
  { tool: "daftar_order", domain: "pos", args: { limit: 30, status: "all" } },
  { tool: "rekap_kas_harian", domain: "shift_kas", args: {} },
  { tool: "pengawasan_kas", domain: "shift_kas", args: {} },
  { tool: "daftar_approval", domain: "keuangan", args: { status: "pending" } },
  { tool: "garage_list_anomaly_cases", domain: "keuangan", args: { status: "OPEN", limit: 15 } },
  { tool: "daftar_menu", domain: "produk_harga", args: {} },
  { tool: "margin_menu", domain: "bahan_resep", args: {} },
  { tool: "cek_stok_bahan", domain: "gudang", args: { hanyaMenipis: true } },
  { tool: "rekomendasi_opname", domain: "gudang", args: {} },
  { tool: "status_operasional", domain: "dapur_bar", args: {} },
  { tool: "ringkasan_marketing", domain: "marketing", args: {} },
  { tool: "status_meja", domain: "meja_qr", args: {} },
  { tool: "daftar_staf", domain: "karyawan", args: {} },
  { tool: "daftar_event", domain: "event", args: {} },
];
const MATCH: Array<[SolverDomain, RegExp]> = [
  ["pos", /\b(pos|order|transaksi|diskon|refund|void|struk|kasir|checkout)\b/i],
  ["shift_kas", /\b(qris|cash|tunai|laci|kas|petty|shift|setoran|bank|saldo|selisih)\b/i],
  ["keuangan", /\b(keuangan|approval|approv|persetujuan|biaya|pengeluaran|closing|laba|rugi|fraud|anomali)\b/i],
  ["produk_harga", /\b(menu|harga|produk|kategori|varian)\b/i],
  ["bahan_resep", /\b(hpp|resep|margin|bahan|food.cost)\b/i],
  ["gudang", /\b(wms|stok|stock|gudang|supplier|opname|waste|po|belanja|kadaluarsa|kedaluwarsa)\b/i],
  ["dapur_bar", /\b(bar|kitchen|dapur|produksi|koki|barista|antrean|antrian|lambat|terlambat)\b/i],
  ["karyawan", /\b(karyawan|staf|staff|hr|absen|gaji|peran|sop)\b/i],
  ["marketing", /\b(marketing|promo|iklan|konten|instagram|campaign)\b/i],
  ["meja_qr", /\b(meja|table|qr|waiter)\b/i],
  ["event", /\b(event|undangan|rsvp)\b/i],
  ["sistem", /\b(sistem|mcp|bug|error|deploy|server|api|integrasi)\b/i],
];
export function selectProblemProbes(message: string, mode: SolverMode = "quick"): SourceProbe[] {
  if (mode === "full" || /\b(seluruh|semua|total|full.system|semua.modul)\b/i.test(message))
    return READ_PROBES;
  const chosen = new Set(MATCH.filter((entry) => entry[1].test(message)).map((entry) => entry[0]));
  if (!chosen.size) { chosen.add("dashboard"); chosen.add("keuangan"); chosen.add("dapur_bar"); }
  if (chosen.has("shift_kas")) chosen.add("pos");
  if (chosen.has("gudang")) chosen.add("dapur_bar");
  if (chosen.has("dapur_bar")) chosen.add("gudang");
  return READ_PROBES.filter((probe) => chosen.has(probe.domain)).slice(0, 6);
}
const SENSITIVE = /password|pin|otp|token|secret|api.?key|credential|cookie|authorization|rekening|bank.?account|phone|telepon|whatsapp|email|alamat|address|nik|ktp|birth|dob|customer.?name|staff.?name|user.?name|requester|pemohon|penerima|person.?name/i;
/** Redact sensitive fields and bound nested data before sending to the AI model. */
export function safeExcerpt(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[ringkasan dibatasi]";
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email disembunyikan]")
    .replace(/\b(?:\+?62|0)8\d{8,12}\b/g, "[nomor disembunyikan]").slice(0, 180);
  if (Array.isArray(value)) return { total: value.length, contoh: value.slice(0, 3).map((item) => safeExcerpt(item, depth + 1)) };
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE.test(key)).slice(0, 16)
    .map(([key, val]) => [key, safeExcerpt(val, depth + 1)]));
}
export function summarizeFacts(tool: string, value: unknown): string[] {
  if (tool === "daftar_approval" && Array.isArray(value))
    return [String(value.filter((row) => row?.status === "pending").length) + " pengajuan menunggu dalam hasil terbatas."];
  if (tool === "cek_stok_bahan" && Array.isArray(value))
    return [String(value.length) + " bahan ditampilkan oleh filter stok menipis; hasil dapat dibatasi."];
  if (tool === "garage_list_anomaly_cases" && value && typeof value === "object") {
    const count = (value as Record<string, unknown>).jumlah;
    if (typeof count === "number") return [String(count) + " alert terbuka; alert bukan tuduhan."];
  }
  if (tool === "status_operasional" && value && typeof value === "object") {
    const alerts = (value as Record<string, unknown>).alerts;
    if (Array.isArray(alerts)) return [String(alerts.length) + " peringatan operasional dalam hasil sumber."];
  }
  return ["Sumber berhasil dibaca; temuan perlu dicocokkan dengan bukti primer dan periode."];
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
export function buildProblemDiagnosis(message: string, mode: SolverMode, evidence: SolverEvidence[], now = new Date()): ProblemDiagnosis {
  const domains = [...new Set(evidence.map((row) => row.domain))];
  const ready = evidence.filter((row) => row.status === "available");
  const missing = evidence.filter((row) => row.status !== "available");
  const enough = ready.length >= 2 && missing.length === 0;
  const hypotheses = domains.includes("shift_kas") ?
    ["Kemungkinan beda klasifikasi metode bayar atau pencatatan kas; belum terbukti."] :
    domains.includes("gudang") ?
    ["Kemungkinan ketidaksesuaian pemakaian, satuan atau pergerakan stok; harus diverifikasi."] :
    ["Penyebab belum dapat ditetapkan tanpa bukti kejadian spesifik."];
  const proposedActions = domains.map((domain) => ACTIONS[domain]).filter((action): action is NonNullable<typeof action> => Boolean(action))
    .slice(0, 5).map((action, idx) => ({ ...action, step: idx + 1 }));
  return { version: "4.0-preview", input: message, generatedAt: now.toISOString(), mode,
    domains, evidence, analysis: {
      status: !ready.length ? "DATA_UNAVAILABLE" : enough ? "EVIDENCE_READY" : "NEED_REVIEW",
      whatHappened: message,
      verifiedFacts: ready.flatMap((row) => row.facts.map((fact) => row.tool + ": " + fact)),
      hypotheses,
      missingEvidence: missing.map((row) => row.tool + ": " + (row.error ?? "tidak tersedia"))
        .concat(["Periksa record primer dan periode sebelum keputusan terkait uang/stok."]),
      confidence: enough ? "PRELIMINARY" : "LOW",
      recommendation: ready.length ?
        "Tindak lanjuti pemeriksaan bukti yang relevan. Semua tindakan perubahan masih usulan." :
        "Jangan mengubah data; pulihkan akses sumber lalu periksa kembali.",
      reasons: ["Rangkuman bersumber dari tools R0; belum merupakan persetujuan Owner.",
        "Dugaan tidak boleh diperlakukan sebagai akar masalah yang terbukti."],
      risks: ["Data parsial atau usang dapat menghasilkan keputusan serta koreksi saldo/stok yang keliru."],
    },
    proposedActions, ownerDecision: "NOT_DECIDED", executionStatus: "NOT_EXECUTED" };
}
export type ReadOnlyRunner = (tool: string, args: SourceProbe["args"]) => Promise<unknown>;
export async function investigateProblem(message: string, mode: SolverMode, read: ReadOnlyRunner): Promise<ProblemDiagnosis> {
  const probes = selectProblemProbes(message, mode);
  const evidence: SolverEvidence[] = [];
  for (let i = 0; i < probes.length; i += 3) {
    const rows = await Promise.all(probes.slice(i, i + 3).map(async (probe): Promise<SolverEvidence> => {
      const checkedAt = new Date().toISOString();
      try {
        const value = await Promise.race([read(probe.tool, probe.args),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sumber melewati batas waktu 8 detik.")), 8000))]);
        const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const count = Array.isArray(value) ? value.length : typeof data.jumlah === "number" ? data.jumlah : null;
        return { tool: probe.tool, domain: probe.domain, checkedAt, dataAsOf: typeof data.dataAsOf === "string" ? data.dataAsOf : null,
          status: "available", recordCount: count, excerpt: safeExcerpt(value), facts: summarizeFacts(probe.tool, value) };
      } catch (error) {
        return { tool: probe.tool, domain: probe.domain, checkedAt, dataAsOf: null, status: "unavailable",
          recordCount: null, excerpt: null, facts: [], error: error instanceof Error ? error.message.slice(0, 180) : "Sumber gagal." };
      }
    }));
    evidence.push(...rows);
  }
  return buildProblemDiagnosis(message, mode, evidence);
}
