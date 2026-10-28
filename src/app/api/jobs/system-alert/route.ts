import { fail, ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { deliverSystemAlerts, systemAlertInput } from "@/lib/system-alert";

export const runtime = "nodejs";

/** Monitor VPS (scripts/vps-monitor.sh) → notifikasi + push ke Owner. Auth: Bearer CRON_SECRET/GARAGE_JOB_SECRET. */
export async function POST(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) return unauthorized;
  const parsed = systemAlertInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Data peringatan tidak valid.");
  return ok(await deliverSystemAlerts(parsed.data));
}
