import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  buildGarageAiAgentReport,
  type GarageAiReportInput,
  type GarageAiReportPeriod,
  garageAiReportMimeType,
} from "@/lib/garage-ai-report";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const reportSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  period: z.enum(["daily", "monthly", "yearly"]).optional(),
  date: z.string().min(4).max(10).optional(),
  uploadToDrive: z.boolean().optional(),
});

function parseReportInput(request: Request): GarageAiReportInput {
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period");
  const period =
    rawPeriod === "daily" || rawPeriod === "monthly" || rawPeriod === "yearly"
      ? (rawPeriod as GarageAiReportPeriod)
      : undefined;
  const daysParam = url.searchParams.get("days");
  const parsedDays = daysParam == null ? null : Number(daysParam);

  return {
    period,
    date: url.searchParams.get("date") ?? undefined,
    days: parsedDays != null && Number.isFinite(parsedDays)
      ? Math.min(Math.max(Math.trunc(parsedDays), 1), 365)
      : undefined,
  };
}

function buildDownloadUrl(report: {
  period: GarageAiReportPeriod;
  date: string;
  days: number;
}) {
  if (report.period === "daily" && report.days !== 1) {
    return `/api/ai/agents/report?days=${report.days}`;
  }

  const params = new URLSearchParams({
    period: report.period,
    date: report.date,
  });

  if (report.days && report.days !== 1) {
    params.set("days", String(report.days));
  }

  return `/api/ai/agents/report?${params.toString()}`;
}

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const report = await buildGarageAiAgentReport(parseReportInput(request));

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI agent report downloaded",
    object: report.fileName,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      days: report.days,
      period: report.period,
      date: report.date,
      periodLabel: report.periodLabel,
      rowCounts: report.rowCounts,
    },
  }).catch(() => undefined);

  return new Response(report.buffer, {
    headers: {
      "Content-Type": garageAiReportMimeType,
      "Content-Disposition": `attachment; filename="${report.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, reportSchema);
  if (body.error) {
    return body.error;
  }

  const report = await buildGarageAiAgentReport({
    days: body.data.days,
    period: body.data.period,
    date: body.data.date,
  });
  const drive = {
    configured: false,
    uploaded: false,
    authMode: "missing" as const,
    fileId: null,
    name: null,
    webViewLink: null,
    webContentLink: null,
    message: "Google Drive dinonaktifkan. Gunakan Download Excel / export manual.",
  };

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI agent report exported",
    object: report.fileName,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      days: report.days,
      period: report.period,
      date: report.date,
      periodLabel: report.periodLabel,
      rowCounts: report.rowCounts,
      drive,
    },
  }).catch(() => undefined);

  return ok({
    fileName: report.fileName,
    generatedAt: report.generatedAt,
    days: report.days,
    period: report.period,
    date: report.date,
    periodLabel: report.periodLabel,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    rowCounts: report.rowCounts,
    downloadUrl: buildDownloadUrl(report),
    driveFileId: null,
    driveWebUrl: null,
    drive,
  });
}
