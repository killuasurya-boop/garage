import { describe, expect, it } from "vitest";

import { buildEventIcs, googleCalendarUrl, icsEscape, toCalendarStamp } from "@/lib/event-calendar";

const event = {
  slug: "grand-opening",
  title: "Grand Opening Garage Coffee",
  tagline: null,
  startsAt: "2026-10-24T08:00:00.000Z",
  endsAt: "2026-10-24T16:00:00.000Z",
  timezone: "Asia/Jakarta",
  venueName: "Garage Coffee",
  address: "Jl. Mayjen Sutoyo, Rambung, Tebing Tinggi",
  mapsUrl: "https://maps.app.goo.gl/x",
  agenda: [
    { start: "15:00", end: "18:00", title: "Live Music" },
    { start: "20:00", end: "23:00", title: "Diskoyoks" },
  ],
};

describe("kalender Grand Opening", () => {
  it("cap waktu UTC & escape iCalendar", () => {
    expect(toCalendarStamp(event.startsAt)).toBe("20261024T080000Z");
    expect(icsEscape("a, b; c\nd")).toBe("a\\, b\\; c\\nd");
  });

  it("file .ics valid: waktu, lokasi, rundown, alarm H-1, CRLF", () => {
    const ics = buildEventIcs(event, "https://garagecoffee.id/grand-opening", new Date("2026-10-19T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261024T080000Z");
    expect(ics).toContain("DTEND:20261024T160000Z");
    expect(ics).toContain("SUMMARY:Grand Opening Garage Coffee");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics.replace(/\r\n /g, "")).toContain("15.00–18.00 WIB · Live Music");
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });

  it("tautan Google Calendar", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261024T080000Z/20261024T160000Z");
    expect(url.searchParams.get("text")).toBe("Grand Opening Garage Coffee");
  });
});
