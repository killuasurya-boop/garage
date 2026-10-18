import { describe, expect, it } from "vitest";

import {
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
});
