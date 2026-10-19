import { describe, expect, it } from "vitest";

import {
  agendaClock,
  agendaLiveState,
  agendaSlotTimes,
  countdownParts,
  eventPhase,
  formatEventDate,
  formatEventTimeRange,
  fromZonedInputValue,
  toZonedInputValue,
} from "@/lib/event-format";

const startsAt = "2026-10-24T08:00:00.000Z"; // 15.00 WIB
const endsAt = "2026-10-24T16:00:00.000Z"; // 23.00 WIB

describe("format event Grand Opening (WIB)", () => {
  it("tanggal & jam sesuai PRD: Sabtu, 24 Oktober 2026 · 15.00–23.00 WIB", () => {
    expect(formatEventDate(startsAt)).toBe("Sabtu, 24 Oktober 2026");
    expect(formatEventTimeRange(startsAt, endsAt)).toBe("15.00–23.00 WIB");
  });

  it("fase acara mengikuti waktu mulai/selesai", () => {
    expect(eventPhase({ startsAt, endsAt }, Date.parse("2026-10-24T07:59:59Z"))).toBe("upcoming");
    expect(eventPhase({ startsAt, endsAt }, Date.parse("2026-10-24T08:00:00Z"))).toBe("live");
    expect(eventPhase({ startsAt, endsAt }, Date.parse("2026-10-24T16:00:00Z"))).toBe("ended");
  });

  it("countdown tidak negatif", () => {
    expect(countdownParts(startsAt, Date.parse("2026-10-23T07:00:00Z"))).toMatchObject({ days: 1, hours: 1, minutes: 0, seconds: 0 });
    expect(countdownParts(startsAt, Date.parse("2026-10-25T00:00:00Z")).total).toBe(0);
  });

  it("input datetime-local bolak-balik di zona WIB", () => {
    expect(toZonedInputValue(startsAt)).toBe("2026-10-24T15:00");
    expect(fromZonedInputValue("2026-10-24T15:00")).toBe(startsAt);
    expect(fromZonedInputValue("24/10/2026")).toBeNull();
  });

  it("jam rundown tampil format Indonesia", () => {
    expect(agendaClock("15:00")).toBe("15.00");
    expect(agendaClock("20:30")).toBe("20.30");
  });
});

describe("mode hari H: status sesi rundown", () => {
  const go = {
    startsAt: "2026-10-24T08:00:00.000Z",
    endsAt: "2026-10-24T16:00:00.000Z",
    timezone: "Asia/Jakarta",
    agenda: [
      { start: "15:00", end: "18:00", title: "Live Music" },
      { start: "20:00", end: "23:00", title: "Diskoyoks" },
    ],
  };
  const at = (iso: string) => Date.parse(iso);

  it("jam sesi dihitung di zona event", () => {
    expect(agendaSlotTimes(go, go.agenda[1])).toEqual({ start: at("2026-10-24T13:00:00Z"), end: at("2026-10-24T16:00:00Z") });
  });

  it("sebelum acara semua upcoming; 16.00 WIB Live Music live + Diskoyoks berikutnya", () => {
    expect(agendaLiveState(go, at("2026-10-23T09:00:00Z")).states).toEqual(["upcoming", "upcoming"]);
    const live = agendaLiveState(go, at("2026-10-24T09:00:00Z"));
    expect(live.states).toEqual(["live", "next"]);
    expect(live.fill).toBeCloseTo(1 / 8);
  });

  it("jeda 18–20 → Live Music selesai, Diskoyoks berikutnya; sesudah acara semua selesai", () => {
    expect(agendaLiveState(go, at("2026-10-24T11:30:00Z")).states).toEqual(["done", "next"]);
    const ended = agendaLiveState(go, at("2026-10-25T01:00:00Z"));
    expect(ended.states).toEqual(["done", "done"]);
    expect(ended.fill).toBe(1);
    expect(ended.phase).toBe("ended");
  });
});
