import { ok } from "@/lib/api-response";
import {
  autopilotHoursLabel,
  isWithinAutopilotHours,
} from "@/lib/garage-ai-autopilot-policy";
import { getAppSettings } from "@/lib/garage-service";
import { roles } from "@/lib/garage-data";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireGarageSession(roles);
  if (session.response) {
    return session.response;
  }

  const settings = await getAppSettings(session.data.profile.outlet.id);
  const withinHours = isWithinAutopilotHours(settings);
  const active = settings.aiAutopilotEnabled && withinHours;

  return ok({
    active,
    withinHours,
    hoursLabel: autopilotHoursLabel(settings),
    whatsappHighAlerts: settings.aiWhatsappHighAlerts,
    message: active
      ? "Shift Copilot autopilot aktif untuk jam operasional ini."
      : !settings.aiAutopilotEnabled
        ? "Autopilot dimatikan di Pengaturan."
        : "Autopilot di luar jam operasional yang dikonfigurasi.",
  });
}
