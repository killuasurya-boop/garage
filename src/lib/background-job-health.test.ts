import { describe, expect, it } from "vitest";

import { EMPTY_JOB_STATE, JOB_ALERT_AFTER_FAILURES, jobAlertNotification, jobHealthRows, nextJobState, type JobState } from "@/lib/background-job-health";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 16, 10, minute));

function run(outcomes: boolean[]) {
  let state: JobState = EMPTY_JOB_STATE;
  const alerts: Array<{ minute: number; state: string; since: string; failures: number }> = [];
  outcomes.forEach((ok, i) => {
    const next = nextJobState(state, ok, at(i));
    state = next.state;
    if (next.alert) alerts.push({ minute: i, ...next.alert });
  });
  return { state, alerts };
}

describe("nextJobState", () => {
  it("gagal 1–2× tidak membunyikan alarm (bisa sesaat)", () => {
    expect(run([true, false, false]).alerts).toEqual([]);
  });

  it(`gagal ${JOB_ALERT_AFTER_FAILURES}× berturut-turut → satu alarm, gagal berikutnya tidak dobel`, () => {
    const { alerts, state } = run([true, false, false, false, false, false]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ minute: 3, state: "failing", failures: 3, since: at(1).toISOString() });
    expect(state).toMatchObject({ consecutiveFailures: 5, alerted: true });
  });

  it("pulih setelah alarm → satu kabar pulih; pulih tanpa alarm → diam", () => {
    const recovered = run([false, false, false, true, true]);
    expect(recovered.alerts.map((a) => a.state)).toEqual(["failing", "recovered"]);
    expect(recovered.state).toMatchObject({ consecutiveFailures: 0, alerted: false, failingSince: null });
    expect(run([false, false, true]).alerts).toEqual([]);
  });

  it("rangkaian gagal baru setelah pulih bisa membunyikan alarm lagi", () => {
    expect(run([false, false, false, true, false, false, false]).alerts.map((a) => a.state)).toEqual(["failing", "recovered", "failing"]);
  });
});

describe("jobHealthRows", () => {
  it("belum jalan = belum ada data; berhasil = jalan; gagal ≥ batas = bermasalah", () => {
    const failing = run([true, false, false, false]).state;
    const rows = jobHealthRows({ partner_hours: failing, partner_sla: run([true]).state });
    expect(rows.find((r) => r.job === "partner_hours")).toMatchObject({ status: "failing", consecutiveFailures: 3 });
    expect(rows.find((r) => r.job === "partner_sla")?.status).toBe("ok");
    expect(rows.find((r) => r.job === "partner_settlement")?.status).toBe("unknown");
  });
});

describe("jobAlertNotification", () => {
  it("pesan tanpa teks error mentah; gagal dedup per jam, pulih per rangkaian", () => {
    const failing = jobAlertNotification("partner_hours", { state: "failing", since: at(1).toISOString(), failures: 3 }, at(3));
    expect(failing).toMatchObject({ kind: "system_alert", severity: "urgent", dedupKey: "job:partner_hours:failing:2026-11-16T10" });
    expect(failing.title).toContain("Jam layanan mitra");
    const recovered = jobAlertNotification("partner_hours", { state: "recovered", since: at(1).toISOString(), failures: 4 }, at(11));
    expect(recovered).toMatchObject({ kind: "system_recovered", dedupKey: `job:partner_hours:recovered:${at(1).toISOString()}` });
    expect(recovered.body).toContain("±10 menit");
  });
});
