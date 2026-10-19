import { agendaClock, eventZoneLabel, type PublicEvent } from "@/lib/event-format";

// =============================================================================
// "Simpan ke Kalender" untuk Grand Opening: tautan Google Calendar + file .ics
// (iPhone/Outlook/Android). Waktu selalu UTC (Z) supaya tiap zona benar.
// =============================================================================

type CalendarEvent = Pick<
  PublicEvent,
  "slug" | "title" | "tagline" | "startsAt" | "endsAt" | "timezone" | "venueName" | "address" | "agenda" | "mapsUrl"
>;

/** "2026-10-24T08:00:00.000Z" → "20261024T080000Z" */
export function toCalendarStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function description(event: CalendarEvent, url?: string) {
  const zone = eventZoneLabel(event.timezone);
  const lines = [
    event.tagline || null,
    ...event.agenda.map((item) => `${agendaClock(item.start)}–${agendaClock(item.end)} ${zone} · ${item.title}`),
    `Lokasi: ${event.venueName}, ${event.address}`,
    `Maps: ${event.mapsUrl}`,
    url ? `Info: ${url}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function googleCalendarUrl(event: CalendarEvent, url?: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toCalendarStamp(event.startsAt)}/${toCalendarStamp(event.endsAt)}`,
    details: description(event, url),
    location: `${event.venueName}, ${event.address}`,
    ctz: event.timezone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape teks iCalendar (RFC 5545 §3.3.11). */
export function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lipat baris > 75 oktet (RFC 5545 §3.1). */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildEventIcs(event: CalendarEvent, url?: string, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Garage Coffee//Garage OS//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.slug}@garagecoffee.id`,
    `DTSTAMP:${toCalendarStamp(now.toISOString())}`,
    `DTSTART:${toCalendarStamp(event.startsAt)}`,
    `DTEND:${toCalendarStamp(event.endsAt)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(`${event.venueName}, ${event.address}`)}`,
    `DESCRIPTION:${icsEscape(description(event, url))}`,
    url ? `URL:${url}` : null,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`Besok: ${event.title}`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function icsResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
