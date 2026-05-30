import { ok } from "@/lib/api-response";
import { garageAiLogRetentionPolicy } from "@/lib/garage-ai-log-retention";
import { googleDriveOAuthStatus } from "@/lib/google-drive-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function reportTimeZone() {
  return process.env.GARAGE_REPORT_TIME_ZONE?.trim() || "Asia/Jakarta";
}

function reportOffsetDays() {
  const parsed = Number(process.env.GARAGE_REPORT_OFFSET_DAYS ?? "0");
  return Number.isInteger(parsed) ? parsed : 0;
}

function maskEmail(email: string | null) {
  if (!email) {
    return null;
  }

  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return "***";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const drive = await googleDriveOAuthStatus({
    origin: url.origin,
  });
  const retention = garageAiLogRetentionPolicy();

  return ok({
    auth: {
      configured: Boolean(
        process.env.GARAGE_JOB_SECRET?.trim() || process.env.CRON_SECRET?.trim(),
      ),
    },
    drive: {
      configured: drive.configured,
      folderIdConfigured: drive.folderIdConfigured,
      serviceAccountConfigured: drive.serviceAccountConfigured,
      serviceAccountEmail: maskEmail(drive.serviceAccountEmail),
      oauthClientConfigured: drive.oauthClientConfigured,
      oauthConnected: drive.oauthConnected,
      oauthEmail: maskEmail(drive.oauthEmail),
      oauthName: drive.oauthName,
      authMode: drive.authMode,
      lastStatus: drive.lastStatus,
      lastError: drive.lastError,
      lastUploadAt: drive.lastUploadAt,
      redirectUri: drive.redirectUri,
      message: drive.message,
    },
    report: {
      path: "/api/ai/jobs/master-report",
      schedule: "55 16 * * *",
      localTimeLabel: "23:55 WIB",
      timeZone: reportTimeZone(),
      offsetDays: reportOffsetDays(),
    },
    cleanup: {
      path: "/api/ai/jobs/log-cleanup",
      schedule: "15 17 */3 * *",
      localTimeLabel: "00:15 WIB tiap 3 hari",
      retentionDays: retention.retentionDays,
      intervalDays: retention.intervalDays,
    },
    doctor: {
      path: "/api/ai/jobs/system-doctor",
      schedule: "*/30 * * * *",
      localTimeLabel: "tiap 30 menit",
      autoHeal: true,
    },
    shiftCopilot: {
      path: "/api/ai/jobs/shift-copilot",
      schedule: "*/10 * * * *",
      localTimeLabel: "tiap 10 menit",
      mode: "rules_engine",
      description:
        "Memantau QR pending, kitchen delay, stok kritis, approval, dan finance guard lalu membuat alert per role.",
    },
  });
}
