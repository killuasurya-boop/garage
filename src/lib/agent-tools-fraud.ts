// Fraud Watch lewat MCP (blueprint V3 §6.1 garage_list_anomaly_cases, §10.4, ADR-006): membaca alert
// risiko (risk-engine B6) + kasus audit. R0 — tidak memutuskan apa pun; keputusan tetap di layar Risiko
// oleh manusia. Setiap hasil membawa aturan, bukti, kelengkapan data, dan peringatan eksplisit bahwa
// alert = prioritas pemeriksaan, BUKAN tuduhan (tes melarang kata menuduh di risk-rules).
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { auditCases } from "@/db/schema";
import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";

const DISPOSITIONS = ["ALL", "OPEN", "FALSE_POSITIVE", "EXPLAINED", "SUBSTANTIATED", "DISPUTED", "CLOSED"] as const;

export const FRAUD_WATCH_NOTICE =
  "Alert = prioritas pemeriksaan berdasarkan aturan & bukti, BUKAN tuduhan. Periksa bukti, kelengkapan data, dan penjelasan lain " +
  "(salah input, retry teknis, beban kerja, data belum lengkap) sebelum menyimpulkan. Keputusan hanya oleh manusia di layar Risiko.";

async function accountabilityCall<T>(run: () => Promise<T>) {
  const { AccountabilityError } = await import("@/lib/cashier-accountability");
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccountabilityError) throw new AgentToolError(error.code, error.message, error.status);
    throw error;
  }
}

export const fraudTools: AgentTool[] = [
  {
    name: "garage_list_anomaly_cases",
    title: "Daftar alert risiko & anomali",
    description:
      "Alert Fraud Watch (selisih kas, pola void/refund, setoran, QRIS, dll.) dengan aturan, level, bukti, dan status review. Owner: semua outlet; Manajer: outletnya. Hanya membaca — alert bukan tuduhan.",
    write: false,
    domain: "keuangan",
    risk: "R0",
    permission: "finance:read",
    input: z.object({
      status: z.enum(DISPOSITIONS).optional().describe("Default OPEN (belum diperiksa). ALL = semua"),
      minLevel: z.number().int().min(1).max(5).optional().describe("Level minimal 1–5 (5 = prioritas tertinggi)"),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(session, args) {
      const { listRiskAlerts } = await import("@/lib/risk-engine");
      const status = (args.status as (typeof DISPOSITIONS)[number] | undefined) ?? "OPEN";
      const alerts = await accountabilityCall(() =>
        listRiskAlerts({ disposition: status as never, minLevel: args.minLevel as number | undefined, limit: (args.limit as number | undefined) ?? 20 }, session),
      );
      const perLevel: Record<string, number> = {};
      for (const alert of alerts) perLevel[`LV${alert.riskLevel}`] = (perLevel[`LV${alert.riskLevel}`] ?? 0) + 1;
      return {
        catatan: FRAUD_WATCH_NOTICE,
        filter: { status, minLevel: args.minLevel ?? null },
        jumlah: alerts.length,
        perLevel,
        alerts: alerts.map((a) => ({
          id: a.id,
          level: a.riskLevel,
          aturan: `${a.ruleId} v${a.ruleVersion}`,
          judul: a.title,
          penjelasan: a.explanation,
          waktuKejadian: a.eventAt,
          shift: a.sessionCode,
          pihakTerkait: a.personName ? `${a.personName} (${a.personRole ?? "-"})` : null,
          cakupanPenguasaan: a.custodyScope,
          kelengkapanData: a.completeness,
          status: a.disposition,
          kasusAudit: a.auditCaseId,
        })),
      };
    },
  },
  {
    name: "garage_get_anomaly_case",
    title: "Detail alert risiko + bukti",
    description:
      "Detail satu alert Fraud Watch: aturan, bukti (ID transaksi/shift), kelengkapan data, riwayat review, dan kasus audit terkait. Hanya membaca — gunakan untuk investigasi, bukan menuduh.",
    write: false,
    domain: "keuangan",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ alertId: z.string().uuid() }),
    async run(session, args) {
      const { listRiskAlerts } = await import("@/lib/risk-engine");
      // Lewat listRiskAlerts agar cakupan peran (Manajer = outletnya) tetap sama dengan layar Risiko.
      const alerts = await accountabilityCall(() => listRiskAlerts({ disposition: "ALL", limit: 500 }, session));
      const alert = alerts.find((a) => a.id === args.alertId);
      if (!alert) throw new AgentToolError("NOT_FOUND", "Alert tidak ditemukan atau di luar cakupan akses Anda.", 404);
      const [kasus] = alert.auditCaseId
        ? await getDb()
            .select({ id: auditCases.id, judul: auditCases.title, status: auditCases.status, tingkat: auditCases.severity, dibuat: auditCases.createdAt, selesai: auditCases.resolvedAt })
            .from(auditCases)
            .where(eq(auditCases.id, alert.auditCaseId))
            .limit(1)
        : [];
      return {
        catatan: FRAUD_WATCH_NOTICE,
        alert: {
          id: alert.id,
          level: alert.riskLevel,
          aturan: `${alert.ruleId} v${alert.ruleVersion}`,
          judul: alert.title,
          penjelasan: alert.explanation,
          waktuKejadian: alert.eventAt,
          terdeteksi: alert.detectedAt,
          shift: alert.sessionCode,
          pihakTerkait: alert.personName ? `${alert.personName} (${alert.personRole ?? "-"})` : null,
          cakupanPenguasaan: alert.custodyScope,
          bukti: alert.evidence,
          kelengkapanData: alert.completeness,
          status: alert.disposition,
          diperiksaOleh: alert.reviewerName,
          diperiksaPada: alert.reviewedAt,
          catatanReview: alert.reviewNote,
        },
        kasusAudit: kasus ?? null,
        tindakLanjut: "Putuskan (benar/keliru/terjelaskan) hanya di Garage Control → Risiko oleh manusia yang bukan pihak terkait.",
      };
    },
  },
];
