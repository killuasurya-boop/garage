import { describe, expect, it } from "vitest";

import { buildRundown, cleanCrewPhone, clockToMinutes, eventReadiness, isTaskOverdue, minutesToClock, performerScheduleMessage, publicSetTime, taskReminders } from "@/lib/event-lineup-rules";

const p = (id: string, over: Partial<Parameters<typeof buildRundown>[0][number]> = {}) => ({
  id,
  name: id,
  kind: "band" as const,
  status: "konfirmasi" as const,
  slotOrder: null,
  setStart: null,
  setMinutes: null,
  ...over,
});

describe("jam", () => {
  it("JJ:MM ↔ menit, nilai tidak valid = null", () => {
    expect(clockToMinutes("19:30")).toBe(1170);
    expect(clockToMinutes("24:00")).toBeNull();
    expect(clockToMinutes("7:30")).toBeNull();
    expect(minutesToClock(1170 + 60)).toBe("20:30");
    expect(minutesToClock(1440 + 15)).toBe("00:15");
  });
  it("nomor WhatsApp dinormalkan ke 08…", () => {
    expect(cleanCrewPhone("+62 812-3456-7890")).toBe("081234567890");
    expect(cleanCrewPhone("12345")).toBeNull();
  });
});

describe("buildRundown", () => {
  it("urut slot, batal dibuang, jam selesai dihitung, bertumpuk & jeda ditandai", () => {
    const rows = buildRundown([
      p("Surai", { slotOrder: 2, setStart: "20:00", setMinutes: 30 }),
      p("Standup Indo Tebing Tinggi", { kind: "standup", slotOrder: 1, setStart: "19:30", setMinutes: 40 }),
      p("Batal Band", { slotOrder: 3, status: "batal" }),
      p("Tanpa Slot", { setStart: "20:45", setMinutes: 30 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Standup Indo Tebing Tinggi", "Surai", "Tanpa Slot"]);
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ start: "19:30", end: "20:10", overlap: false });
    expect(rows[1]).toMatchObject({ start: "20:00", end: "20:30", overlap: true, gapMinutes: -10 });
    expect(rows[2]).toMatchObject({ overlap: false, gapMinutes: 15 });
  });
});

describe("tugas & kesiapan", () => {
  it("terlambat hanya bila belum selesai dan tenggat lewat", () => {
    expect(isTaskOverdue({ status: "todo", dueDate: "2026-11-15" }, "2026-11-16")).toBe(true);
    expect(isTaskOverdue({ status: "selesai", dueDate: "2026-11-15" }, "2026-11-16")).toBe(false);
    expect(isTaskOverdue({ status: "proses", dueDate: "2026-11-16" }, "2026-11-16")).toBe(false);
    expect(isTaskOverdue({ status: "todo", dueDate: null }, "2026-11-16")).toBe(false);
  });
  it("checklist kesiapan dari data nyata", () => {
    const empty = eventReadiness({ performers: [], crew: [], tasks: [], overlaps: 0 }, "2026-11-16");
    expect(empty.done).toBe(2);
    const ready = eventReadiness(
      {
        performers: [{ status: "konfirmasi", setStart: "20:00", setMinutes: 30, contactPhone: "0812" }],
        crew: [
          { role: "ketua", status: "aktif" },
          { role: "stage", status: "aktif" },
        ],
        tasks: [{ status: "selesai", dueDate: "2026-11-01" }],
        overlaps: 0,
      },
      "2026-11-16",
    );
    expect(ready.done).toBe(ready.total);
  });
  it("pesan jadwal WhatsApp menyebut slot & jam", () => {
    expect(performerScheduleMessage("GIGS", { name: "Surai", slot: 2, start: "20:00", end: "20:30" })).toContain("slot #02, 20:00–20:30 WIB");
  });
});

describe("buildRundown lewat tengah malam", () => {
  it("23:30–00:00 lalu 00:00–00:30 tidak bertumpuk, jeda 0", () => {
    const rows = buildRundown([
      p("A", { slotOrder: 1, setStart: "23:30", setMinutes: 30 }),
      p("B", { slotOrder: 2, setStart: "00:00", setMinutes: 30 }),
      p("C", { slotOrder: 3, setStart: "00:20", setMinutes: 20 }),
    ]);
    expect(rows[1]).toMatchObject({ start: "00:00", end: "00:30", overlap: false, gapMinutes: 0 });
    expect(rows[2]).toMatchObject({ start: "00:20", overlap: true, gapMinutes: -10 });
  });
});

describe("publicSetTime", () => {
  it("jam website pakai titik; tanpa jam → null", () => {
    expect(publicSetTime({ start: "20:00", end: "20:45" })).toBe("20.00–20.45");
    expect(publicSetTime({ start: "23:30", end: null })).toBe("23.30");
    expect(publicSetTime({ start: null, end: null })).toBeNull();
  });
});

describe("taskReminders", () => {
  const task = (id: string, dueDate: string | null, over: Record<string, unknown> = {}) => ({
    id,
    eventName: "GIGS",
    title: `Tugas ${id}`,
    status: "todo" as const,
    priority: "normal" as const,
    dueDate,
    crewName: "Raka",
    ...over,
  });
  const today = "2026-11-20";

  it("H-1, hari H, terlambat 1/3/7 (tahap tertinggi yang tercapai)", () => {
    const out = taskReminders(
      [task("a", "2026-11-21"), task("b", "2026-11-20"), task("c", "2026-11-19"), task("d", "2026-11-18"), task("e", "2026-11-17"), task("f", "2026-11-13"), task("g", "2026-11-22")],
      today,
    );
    expect(out.map((r) => [r.taskId, r.stage])).toEqual([
      ["a", "h-1"],
      ["b", "hari-h"],
      ["c", "terlambat-1"],
      ["d", "terlambat-1"],
      ["e", "terlambat-3"],
      ["f", "terlambat-7"],
    ]);
    expect(out[0]).toMatchObject({ key: "lineup-task:a:h-1", severity: "info", title: "Tugas panitia tenggat besok: Tugas a", body: "GIGS · tenggat 2026-11-21 · PIC Raka" });
    expect(out[2].severity).toBe("warning");
  });

  it("selesai/batal/tanpa tenggat tidak diingatkan; prioritas tinggi = warning; tanpa PIC disebut", () => {
    const out = taskReminders(
      [
        task("x", "2026-11-20", { status: "selesai" }),
        task("y", "2026-11-20", { status: "batal" }),
        task("z", null),
        task("p", "2026-11-21", { status: "proses", priority: "tinggi", crewName: null }),
      ],
      today,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ taskId: "p", severity: "warning" });
    expect(out[0].body).toContain("belum ada PIC");
  });
});

describe("GIGS EO fase 4", () => {
  it("scheduleReminders: H-1 & hari H, satu per event, yang sudah dikirim tidak dihitung", async () => {
    const { scheduleReminders } = await import("@/lib/event-lineup-rules");
    const row = (name: string, sent = false, hasContact = true) => ({ eventId: "e1", eventName: "GIGS", eventDate: "2026-12-20", name, hasContact, scheduleSent: sent });
    const out = scheduleReminders([row("Surai"), row("Standup", false, false), row("Sudah", true)], "2026-12-19");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "lineup-schedule:e1:h-1", severity: "warning", title: "2 penampil belum dikirimi jadwal (event besok)" });
    expect(out[0].body).toContain("1 tanpa nomor WA");
    expect(scheduleReminders([row("Surai")], "2026-12-17")).toEqual([]);
  });
  it("eventReadiness: checklist operasional ikut bila ada", () => {
    const base = { performers: [], crew: [], tasks: [], overlaps: 0 };
    expect(eventReadiness(base, "2026-12-01").total).toBe(7);
    const withOps = eventReadiness({ ...base, ops: { done: 3, total: 10 } }, "2026-12-01");
    expect(withOps.total).toBe(8);
    expect(withOps.items.find((i) => i.key === "operasional")).toMatchObject({ done: false, detail: "3/10 selesai" });
  });
});
