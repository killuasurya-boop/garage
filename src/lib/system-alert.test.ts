import { describe, expect, it } from "vitest";

import { alertNotification, systemAlertInput } from "@/lib/system-alert";

// Monitor VPS → notifikasi Owner (scripts/vps-monitor.sh).

describe("peringatan server untuk Owner", () => {
  const now = new Date("2026-10-29T02:30:00.000Z");

  it("gagal: kritis untuk aplikasi/backup/staging, pengingat maksimal 1×/jam", () => {
    const app = alertNotification({ check: "app", state: "failing", message: "Health check HTTP 502" }, now);
    expect(app).toMatchObject({ kind: "system_alert", severity: "urgent", title: "Server: Aplikasi Garage OS bermasalah", body: "Health check HTTP 502" });
    expect(app.dedupKey).toBe("sys:app:failing:2026-10-29T02");
    const later = alertNotification({ check: "app", state: "failing", message: "x" }, new Date("2026-10-29T02:55:00.000Z"));
    expect(later.dedupKey).toBe(app.dedupKey);
    expect(alertNotification({ check: "disk", state: "failing", message: "Disk 90%" }, now).severity).toBe("warning");
    // Backup belum keluar VPS = risiko data → kritis.
    expect(alertNotification({ check: "offsite", state: "failing", message: "50 jam" }, now)).toMatchObject({ severity: "urgent", title: "Server: Backup di luar VPS (laptop/cloud) bermasalah" });
  });

  it("pulih: menyebut lama bermasalah & sekali per kejadian", () => {
    const note = alertNotification({ check: "app", state: "recovered", message: "Aplikasi sehat", since: "2026-10-29T02:10:00.000Z" }, now);
    expect(note).toMatchObject({ kind: "system_recovered", severity: "info", title: "Pulih: Aplikasi Garage OS" });
    expect(note.body).toBe("Aplikasi sehat (bermasalah ±20 menit)");
    expect(note.dedupKey).toBe("sys:app:recovered:2026-10-29T02:10:00.000Z");
  });

  it("payload monitor divalidasi", () => {
    expect(systemAlertInput.safeParse({ host: "vps", events: [{ check: "disk", state: "failing", message: "Disk 90%" }] }).success).toBe(true);
    expect(systemAlertInput.safeParse({ host: "vps", events: [] }).success).toBe(false);
    expect(systemAlertInput.safeParse({ host: "vps", events: [{ check: "rm -rf", state: "failing", message: "x" }] }).success).toBe(false);
    expect(systemAlertInput.safeParse({ host: "vps", events: [{ check: "app", state: "failing", message: "x".repeat(241) }] }).success).toBe(false);
  });
});
