import { describe, expect, it } from "vitest";

import { buildRundown, cleanCrewPhone, clockToMinutes, eventReadiness, isTaskOverdue, minutesToClock, performerScheduleMessage } from "@/lib/event-lineup-rules";

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
