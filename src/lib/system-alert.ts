// =============================================================================
// Peringatan server untuk Owner (scripts/vps-monitor.sh → POST /api/jobs/system-alert).
// Tanpa layanan luar: notifikasi Garage OS + push ke HP Owner. Anti-spam: satu
// notifikasi per pemeriksaan per jam (dedupKey), pemulihan dilaporkan sekali.
// =============================================================================
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { staffProfiles } from "@/db/schema";
import { notifyStaff } from "@/lib/staff-notifications";

export const SYSTEM_CHECKS = ["app", "containers", "disk", "memory", "backup", "offsite", "staging_guard", "restarts"] as const;
export type SystemCheck = (typeof SYSTEM_CHECKS)[number];

export const SYSTEM_CHECK_LABEL: Record<SystemCheck, string> = {
  app: "Aplikasi Garage OS",
  containers: "Layanan server (database/Caddy/backup)",
  disk: "Ruang disk VPS",
  memory: "Memori (RAM) VPS",
  backup: "Backup database harian",
  offsite: "Backup di luar VPS (laptop/cloud)",
  staging_guard: "Pemisahan staging dari produksi",
  restarts: "Aplikasi restart berulang",
};

export const systemAlertInput = z.object({
  host: z.string().trim().min(1).max(80),
  events: z
    .array(
      z.object({
        check: z.enum(SYSTEM_CHECKS),
        state: z.enum(["failing", "recovered"]),
        message: z.string().trim().min(1).max(240),
        /** ISO waktu pertama gagal (untuk pesan pemulihan "mati X menit"). */
        since: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export type SystemAlertInput = z.infer<typeof systemAlertInput>;

/** Ubah satu kejadian monitor menjadi notifikasi (murni; dites). */
export function alertNotification(event: SystemAlertInput["events"][number], now: Date) {
  const label = SYSTEM_CHECK_LABEL[event.check];
  const hourKey = now.toISOString().slice(0, 13);
  if (event.state === "recovered") {
    const minutes = event.since ? Math.max(1, Math.round((now.getTime() - new Date(event.since).getTime()) / 60_000)) : null;
    return {
      kind: "system_recovered",
      severity: "info" as const,
      title: `Pulih: ${label}`,
      body: `${event.message}${minutes ? ` (bermasalah ±${minutes} menit)` : ""}`,
      dedupKey: `sys:${event.check}:recovered:${event.since ?? hourKey}`,
    };
  }
  return {
    kind: "system_alert",
    severity: event.check === "app" || event.check === "backup" || event.check === "offsite" || event.check === "staging_guard" ? ("urgent" as const) : ("warning" as const),
    title: `Server: ${label} bermasalah`,
    body: event.message,
    // Pengingat paling sering sekali per jam per pemeriksaan.
    dedupKey: `sys:${event.check}:failing:${hourKey}`,
  };
}

export async function deliverSystemAlerts(input: SystemAlertInput, now = new Date()) {
  const owners = await getDb()
    .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
  let delivered = 0;
  for (const event of input.events) {
    const note = alertNotification(event, now);
    for (const owner of owners) {
      const row = await notifyStaff({
        outletId: owner.outletId,
        audience: "user",
        userId: owner.userId,
        kind: note.kind,
        severity: note.severity,
        title: note.title,
        body: `${note.body} · ${input.host}`,
        url: "/control/cash-closing",
        dedupKey: `${note.dedupKey}:${owner.userId}`,
      });
      if (row) delivered += 1;
    }
  }
  return { owners: owners.length, delivered };
}
