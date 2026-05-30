import { fail, ok } from "@/lib/api-response";
import {
  buildGarageAiAgentReport,
  type GarageAiReportPeriod,
} from "@/lib/garage-ai-report";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { createAuditLog } from "@/lib/garage-service";

export const runtime = "nodejs";

function reportTimeZone() {
  return process.env.GARAGE_REPORT_TIME_ZONE?.trim() || "Asia/Jakarta";
}

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: reportTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

function defaultReportDate(period: GarageAiReportPeriod) {
  const offsetDays = Number(process.env.GARAGE_REPORT_OFFSET_DAYS ?? "0");
  const safeOffsetDays = Number.isInteger(offsetDays) ? offsetDays : 0;
  const date = new Date(Date.now() - safeOffsetDays * 24 * 60 * 60 * 1000);
  const parts = localDateParts(date);

  if (period === "yearly") {
    return parts.year;
  }

  if (period === "monthly") {
    return `${parts.year}-${parts.month}`;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parsePeriod(value: string | null): GarageAiReportPeriod {
  if (value === "monthly" || value === "yearly") {
    return value;
  }

  return "daily";
}

function shouldUpload(value: string | null) {
  return process.env.GARAGE_REPORT_DRIVE_UPLOAD_ENABLED === "true" && value === "true";
}

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const date = url.searchParams.get("date") ?? defaultReportDate(period);
  const uploadToDrive = shouldUpload(url.searchParams.get("uploadToDrive"));

  try {
    const report = await buildGarageAiAgentReport({ period, date });

    if (!uploadToDrive) {
      await createAuditLog({
        actor: "GARAGE AI Cron",
        action: "GARAGE AI scheduled report generated",
        object: report.fileName,
        device: "system-cron",
        status: "recorded",
        metadata: {
          period: report.period,
          date: report.date,
          periodLabel: report.periodLabel,
          rowCounts: report.rowCounts,
          uploadToDrive,
        },
      });

      return ok({
        job: "master-report",
        uploaded: false,
        skipped: false,
        message: "Laporan berhasil dibuat untuk export manual. Google Drive dinonaktifkan.",
        fileName: report.fileName,
        generatedAt: report.generatedAt,
        period: report.period,
        date: report.date,
        periodLabel: report.periodLabel,
        rowCounts: report.rowCounts,
      });
    }

    await createAuditLog({
      actor: "GARAGE AI Cron",
      action: "GARAGE AI scheduled report generated",
      object: report.fileName,
      device: "system-cron",
      status: "recorded",
      metadata: {
        period: report.period,
        date: report.date,
        periodLabel: report.periodLabel,
        rowCounts: report.rowCounts,
        driveUploadEnabled: false,
      },
    });

    return ok({
      job: "master-report",
      uploaded: false,
      skipped: false,
      message: "Laporan GARAGE AI berhasil dibuat. Google Drive dinonaktifkan; gunakan export/download Excel.",
      fileName: report.fileName,
      generatedAt: report.generatedAt,
      period: report.period,
      date: report.date,
      periodLabel: report.periodLabel,
      rowCounts: report.rowCounts,
      driveFileId: null,
      driveWebUrl: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GARAGE AI scheduled report gagal.";

    await createAuditLog({
      actor: "GARAGE AI Cron",
      action: "GARAGE AI scheduled report failed",
      object: `${period}:${date}`,
      device: "system-cron",
      status: "error",
      metadata: {
        period,
        date,
        error: message,
      },
    }).catch(() => undefined);

    return fail(500, "AI_MASTER_REPORT_JOB_FAILED", message);
  }
}
