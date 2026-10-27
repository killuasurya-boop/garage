// Pengingat kerja Aya untuk staf (keputusan Owner D-07): Aya mengingatkan tiap divisi
// pekerjaan yang perlu dikontrol. Sumber = alert Garage Control Center (/api/ops-center,
// tanpa nominal uang), disaring per peran & stasiun. Client-safe (tanpa akses DB).
import type { AyaExpression } from "@/components/garage/aya/aya-character";
import type { OpsCenterData } from "@/lib/ops-center-types";
import type { Role } from "@/lib/garage-data";
import { normalizeWorkstation } from "@/lib/garage-production-rules";

export type AyaReminder = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  module: "kitchen" | "waiter" | "inventory" | null;
  actionLabel: string | null;
};

type Source = OpsCenterData["alerts"][number]["source"];

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Sumber alert yang relevan untuk divisi ini. */
export function ayaSourcesFor(role: Role, workstation?: string | null): Set<Source> {
  if (role === "Owner" || role === "Manajer") return new Set(["produksi", "serving", "stok", "batch"]);
  if (role === "Waiter") return new Set(["serving"]);
  // Kasir dengan stasiun = staf Bar/Dapur/helper; tanpa stasiun = kasir depan.
  const ws = normalizeWorkstation(workstation);
  if (ws && ws !== "kurir") return new Set(["produksi", "batch", "stok"]);
  return new Set(["serving", "produksi"]);
}

/** Alert stasiun yang tidak dipegang staf ini (mis. Bar melihat alert Dapur) dibuang. */
function stationOf(alertId: string): "Bar" | "Food" | null {
  if (alertId.endsWith("-Bar")) return "Bar";
  if (alertId.endsWith("-Food")) return "Food";
  return null;
}

export function ayaRemindersFor(
  viewer: { role: Role; workstation?: string | null },
  data: Pick<OpsCenterData, "alerts" | "canOperate">,
  limit = 4,
): AyaReminder[] {
  const sources = ayaSourcesFor(viewer.role, viewer.workstation);
  const management = viewer.role === "Owner" || viewer.role === "Manajer";
  return data.alerts
    .filter((alert) => sources.has(alert.source))
    .filter((alert) => {
      const station = stationOf(alert.id);
      return management || !station || data.canOperate[station];
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit)
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      module: alert.actionModule,
      actionLabel: alert.actionLabel,
    }));
}

/** Ekspresi Aya mengikuti keadaan: kritis = siaga, waspada = berpikir, aman = senang. */
export function ayaMoodFor(reminders: AyaReminder[]): AyaExpression {
  if (reminders.some((r) => r.severity === "critical")) return "alert";
  if (reminders.some((r) => r.severity === "warning")) return "thinking";
  return "happy";
}
