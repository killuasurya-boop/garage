// AI Governance (Batch 7) — aturan & ringkasan murni (tanpa DB), aman diimport dari komponen client.
// Panel ini hanya MEMBACA aturan server dan mengubah dua saklar yang sudah ada
// (mcpChatgptPaused, mcpChatgptWriteEnabled). Tingkat risiko tool, preview + token, kode 2FA R3,
// dan larangan R4 ditetapkan di kode server — tidak bisa dilonggarkan dari layar.
import { GARAGE_DOMAINS, R4_FORBIDDEN, RISK_LABELS, type GarageDomainId, type ToolRisk } from "@/lib/mcp-tool-registry";

export type AiMode = "paused" | "read_only" | "controlled";

export const AI_MODE_LABEL: Record<AiMode, { title: string; detail: string }> = {
  paused: { title: "Dijeda", detail: "Semua perintah dari ChatGPT ditolak. Layar Owner tetap jalan." },
  read_only: { title: "Baca saja", detail: "AYA hanya membaca & melapor. Perintah yang mengubah data ditolak." },
  controlled: {
    title: "Eksekusi terkendali",
    detail: "Perubahan data boleh, selalu lewat preview + konfirmasi Owner; aksi kritis (R3) wajib kode 2FA.",
  },
};

export function aiModeOf(settings: { paused: boolean; writeEnabled: boolean }): AiMode {
  if (settings.paused) return "paused";
  return settings.writeEnabled ? "controlled" : "read_only";
}

/** Nilai saklar untuk sebuah mode. "Dijeda" juga mematikan tulis, supaya membuka jeda tidak langsung membuka tulis. */
export function settingsForMode(mode: AiMode): { mcpChatgptPaused: boolean; mcpChatgptWriteEnabled: boolean } {
  if (mode === "paused") return { mcpChatgptPaused: true, mcpChatgptWriteEnabled: false };
  if (mode === "read_only") return { mcpChatgptPaused: false, mcpChatgptWriteEnabled: false };
  return { mcpChatgptPaused: false, mcpChatgptWriteEnabled: true };
}

/** Aturan tetap di server. Ditampilkan apa adanya; panel tidak punya tombol untuk mengubahnya. */
export const FIXED_GUARDRAILS = [
  "R2/R3: panggilan pertama hanya preview + token sekali pakai (5 menit); eksekusi harus mengulang argumen yang sama persis.",
  "R3: kode 2FA Owner diperiksa SEBELUM token diklaim.",
  "AYA Problem Solver hanya memakai tool baca (R0) dari daftar putih; tidak pernah mengubah data.",
  "Kata \"ACC\", \"jalankan semua\" atau sejenisnya di chat/data tidak menyetujui apa pun.",
  "Keputusan disetujui ≠ eksekusi berhasil: berhasil hanya dari operasi ber-ID yang tercatat.",
  "Data dari tool/dokumen diperlakukan sebagai data, bukan instruksi (perlindungan prompt injection).",
  "Ke penyedia AI eksternal hanya ringkasan tersensor (angka, ID, status, periode) — tanpa nama, kontak, rahasia.",
  "Maks 4 panggilan tool ChatGPT bersamaan per Owner; tool baca dibatasi 25 detik, tool tulis tidak pernah dipotong.",
] as const;

export { R4_FORBIDDEN };

export type GovernanceTool = { name: string; title: string; domain: GarageDomainId; risk: ToolRisk; write: boolean };

export function summarizeTools(tools: GovernanceTool[]) {
  const byRisk = (["R0", "R1", "R2", "R3"] as ToolRisk[]).map((risk) => ({
    risk,
    label: RISK_LABELS[risk],
    count: tools.filter((tool) => tool.risk === risk).length,
  }));
  const domains = GARAGE_DOMAINS.map((domain) => {
    const own = tools.filter((tool) => tool.domain === domain.id);
    const risks: Record<ToolRisk, number> = { R0: 0, R1: 0, R2: 0, R3: 0 };
    for (const tool of own) risks[tool.risk] += 1;
    return {
      id: domain.id,
      label: domain.label,
      total: own.length,
      risks,
      tools: own
        .map((tool) => ({ name: tool.name, title: tool.title, risk: tool.risk }))
        .sort((a, b) => b.risk.localeCompare(a.risk) || a.name.localeCompare(b.name)),
    };
  });
  return { total: tools.length, byRisk, domains };
}

export type GovernanceOperationRow = { status: string; risk: string; expiresAt: Date; createdAt: Date; source: string };

/**
 * Status operasi R2/R3: confirmed tanpa executed/failed = TIDAK PASTI (jangan dianggap berhasil);
 * pending yang lewat masa token = kedaluwarsa (tidak pernah dijalankan).
 */
export function summarizeOperations(rows: GovernanceOperationRow[], now: number) {
  const counts = { executed: 0, failed: 0, uncertain: 0, waiting: 0, expired: 0 };
  const byRisk: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const row of rows) {
    if (row.status === "executed") counts.executed += 1;
    else if (row.status === "failed") counts.failed += 1;
    else if (row.status === "confirmed") counts.uncertain += 1;
    else if (row.status === "pending") {
      if (row.expiresAt.getTime() <= now) counts.expired += 1;
      else counts.waiting += 1;
    } else counts.expired += 1;
    byRisk[row.risk] = (byRisk[row.risk] ?? 0) + 1;
    bySource[row.source] = (bySource[row.source] ?? 0) + 1;
  }
  return { total: rows.length, ...counts, byRisk, bySource };
}

export type GovernanceCaseRow = { id: string; status: string; latestVerdict: string | null };

/** Efektivitas solusi = kasus terverifikasi membaik ÷ kasus yang sudah diverifikasi (bukan ÷ semua kasus). */
export function summarizeCases(rows: GovernanceCaseRow[]) {
  const status = { open: 0, monitoring: 0, resolved: 0, dismissed: 0 };
  const verdicts = { improved: 0, unchanged: 0, worse: 0, unknown: 0 };
  let verified = 0;
  for (const row of rows) {
    if (row.status in status) status[row.status as keyof typeof status] += 1;
    if (row.latestVerdict) {
      verified += 1;
      const key = (row.latestVerdict in verdicts ? row.latestVerdict : "unknown") as keyof typeof verdicts;
      verdicts[key] += 1;
    }
  }
  return {
    total: rows.length,
    status,
    verified,
    verdicts,
    effectivenessPct: verified > 0 ? Math.round((verdicts.improved / verified) * 100) : null,
  };
}

export type DecisionQualityRow = {
  status: string;
  decidedVia: string | null;
  executionStatus: string;
  payload: Record<string, unknown> | null;
};

/**
 * Tahap D "LEARN" (audit SA-17): kualitas keputusan 30 hari dari data nyata. Kesesuaian = keputusan Owner
 * searah rekomendasi aturan yang tercatat SAAT memutus (Decision Center). Bukan klaim AI belajar sendiri:
 * angka ini bahan Owner menilai apakah aturan rekomendasi perlu diubah.
 */
export function summarizeDecisionQuality(rows: DecisionQualityRow[]) {
  const byChannel: Record<string, number> = {};
  let recorded = 0;
  let followed = 0;
  const byConfidence: Record<string, { total: number; followed: number }> = {};
  let executed = 0;
  let executionOk = 0;
  for (const row of rows) {
    if (row.decidedVia) byChannel[row.decidedVia] = (byChannel[row.decidedVia] ?? 0) + 1;
    const dc = (row.payload as { decisionCenter?: { followed?: boolean | null; confidence?: string } } | null)?.decisionCenter;
    if (dc && typeof dc.followed === "boolean") {
      recorded += 1;
      if (dc.followed) followed += 1;
      const level = dc.confidence ?? "tidak tercatat";
      byConfidence[level] ??= { total: 0, followed: 0 };
      byConfidence[level].total += 1;
      if (dc.followed) byConfidence[level].followed += 1;
    }
    if (["succeeded", "failed", "uncertain"].includes(row.executionStatus)) {
      executed += 1;
      if (row.executionStatus === "succeeded") executionOk += 1;
    }
  }
  return {
    decided: rows.filter((r) => r.status !== "pending").length,
    expired: rows.filter((r) => r.status === "expired").length,
    superseded: rows.filter((r) => r.status === "superseded").length,
    uncertain: rows.filter((r) => r.executionStatus === "uncertain").length,
    byChannel,
    recommendation: { recorded, followed, followedPct: recorded ? Math.round((followed / recorded) * 100) : null, byConfidence },
    execution: { attempted: executed, succeeded: executionOk, successPct: executed ? Math.round((executionOk / executed) * 100) : null },
  };
}
