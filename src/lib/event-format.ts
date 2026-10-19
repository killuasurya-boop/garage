// Format waktu event (aman untuk client component). Semua tampilan memakai zona
// event (default Asia/Jakarta) supaya homepage, landing, dan undangan identik.

export type EventPhase = "upcoming" | "live" | "ended";

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  mapsUrl: string;
  contactWhatsapp: string;
  highlights: string[];
  about: string | null;
  faq: Array<{ q: string; a: string }>;
  gallery: Array<{ src: string; alt: string }>;
  agenda: EventAgendaItem[];
  promoText: string | null;
  sponsorName: string | null;
  ageGate: boolean;
  rsvpDeadline: string | null;
};

export type EventAgendaItem = { start: string; end: string; title: string };

export const AGENDA_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "15:00" → "15.00" (format jam Indonesia). */
export function agendaClock(value: string) {
  return value.replace(":", ".");
}

const ZONE_LABEL: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function eventZoneLabel(timezone: string) {
  return ZONE_LABEL[timezone] ?? timezone;
}

/** "Sabtu, 24 Oktober 2026" */
export function formatEventDate(iso: string, timezone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** "15.00" */
export function formatEventClock(iso: string, timezone = "Asia/Jakarta") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}.${minute}`;
}

/** "15.00–23.00 WIB" */
export function formatEventTimeRange(startsAt: string, endsAt: string, timezone = "Asia/Jakarta") {
  return `${formatEventClock(startsAt, timezone)}–${formatEventClock(endsAt, timezone)} ${eventZoneLabel(timezone)}`;
}

export function eventPhase(event: Pick<PublicEvent, "startsAt" | "endsAt">, now = Date.now()): EventPhase {
  if (now < new Date(event.startsAt).getTime()) return "upcoming";
  if (now < new Date(event.endsAt).getTime()) return "live";
  return "ended";
}

/** Sisa waktu ke mulai acara, dipecah hari/jam/menit/detik (tidak negatif). */
export function countdownParts(targetIso: string, now = Date.now()) {
  const total = Math.max(0, new Date(targetIso).getTime() - now);
  const seconds = Math.floor(total / 1000);
  return {
    total,
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: seconds % 60,
  };
}

/** ISO → nilai `<input type="datetime-local">` di zona event. */
export function toZonedInputValue(iso: string, timezone = "Asia/Jakarta") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const ZONE_OFFSET: Record<string, string> = {
  "Asia/Jakarta": "+07:00",
  "Asia/Makassar": "+08:00",
  "Asia/Jayapura": "+09:00",
};

/** Nilai datetime-local (waktu lokal event) → ISO dengan offset zona event. */
export function fromZonedInputValue(value: string, timezone = "Asia/Jakarta") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${ZONE_OFFSET[timezone] ?? "+07:00"}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type AgendaSlotState = "upcoming" | "next" | "live" | "done";

/** Jam sesi rundown ("15:00") → epoch ms di tanggal acara (zona event); sesi lewat tengah malam pindah ke hari berikutnya. */
export function agendaSlotTimes(event: Pick<PublicEvent, "startsAt" | "timezone">, item: EventAgendaItem) {
  const day = toZonedInputValue(event.startsAt, event.timezone).slice(0, 10);
  const at = (clock: string) => Date.parse(fromZonedInputValue(`${day}T${clock}`, event.timezone) ?? event.startsAt);
  const start = at(item.start);
  let end = at(item.end);
  if (end <= start) end += 86_400_000;
  return { start, end };
}

/**
 * Status tiap sesi untuk mode hari H: done / live / next (sesi berikut saat acara
 * berjalan) / upcoming, plus `fill` 0–1 untuk garis waktu rundown.
 */
export function agendaLiveState(event: Pick<PublicEvent, "startsAt" | "endsAt" | "timezone" | "agenda">, now = Date.now()) {
  const slots = event.agenda.map((item) => agendaSlotTimes(event, item));
  const phase = eventPhase(event, now);
  let nextMarked = false;
  const states: AgendaSlotState[] = slots.map((slot) => {
    if (now >= slot.end) return "done";
    if (now >= slot.start) return "live";
    if (phase === "live" && !nextMarked) {
      nextMarked = true;
      return "next";
    }
    return "upcoming";
  });
  const first = slots[0]?.start ?? Date.parse(event.startsAt);
  const last = slots.at(-1)?.end ?? Date.parse(event.endsAt);
  const fill = last > first ? Math.min(1, Math.max(0, (now - first) / (last - first))) : 0;
  return { states, fill, phase };
}
