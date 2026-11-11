// Pengaturan rapor kinerja mitra dari Pengaturan outlet (satu sumber untuk route staf & Portal Mitra).
import type { AppSettings } from "@/lib/garage-app-settings-types";

export function partnerPerformanceSettings(settings: Pick<AppSettings, "partnerSlaEscalateMinutes" | "partnerPrepTargetMinutes" | "partnerReadyWaitWarnMinutes">) {
  return {
    acceptSlaMinutes: settings.partnerSlaEscalateMinutes,
    prepTargetMinutes: settings.partnerPrepTargetMinutes,
    pickupSlaMinutes: settings.partnerReadyWaitWarnMinutes,
  };
}
