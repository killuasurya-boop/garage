import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLogs, eventMenuEntries, events } from "@/db/schema";
import { AGENDA_TIME, toZonedInputValue, type PublicEvent } from "@/lib/event-format";
import { renameEventReferences } from "@/lib/event-master";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

// =============================================================================
// Event & Undangan Digital (PRD GC-PRD-EVENT-001). Satu baris `events` menjadi
// sumber data homepage, landing /grand-opening, dan halaman undangan.
// =============================================================================

export const GRAND_OPENING_SLUG = "grand-opening";
export const EVENT_STATUSES = ["draft", "published", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export class EventError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EventError";
  }
}

type EventRow = typeof events.$inferSelect;

export type AdminEvent = PublicEvent & {
  outletId: string | null;
  bannerUrl: string | null;
  status: EventStatus;
  featuredOnHome: boolean;
  platformSlug: string | null;
  capacity: number | null;
  defaultMaxPax: number;
  contentVersion: number;
  updatedAt: string;
};

function cleanStringList(value: unknown, max: number) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function cleanFaq(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      q: String((item as { q?: unknown })?.q ?? "").trim(),
      a: String((item as { a?: unknown })?.a ?? "").trim(),
    }))
    .filter((item) => item.q && item.a)
    .slice(0, 12);
}

function cleanGallery(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      src: String((item as { src?: unknown })?.src ?? "").trim(),
      alt: String((item as { alt?: unknown })?.alt ?? "").trim(),
    }))
    .filter((item) => isSafeImageSrc(item.src) && item.alt)
    .slice(0, 12);
}

function cleanAgenda(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      start: String((item as { start?: unknown })?.start ?? "").trim(),
      end: String((item as { end?: unknown })?.end ?? "").trim(),
      title: String((item as { title?: unknown })?.title ?? "").trim(),
    }))
    .filter((item) => AGENDA_TIME.test(item.start) && AGENDA_TIME.test(item.end) && item.title)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12);
}

function isSafeImageSrc(src: string) {
  return (src.startsWith("/") && !src.startsWith("//")) || /^https:\/\/[^\s"'<>]+$/.test(src);
}

export function toPublicEvent(row: EventRow): PublicEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    venueName: row.venueName,
    address: row.address,
    mapsUrl: row.mapsUrl,
    contactWhatsapp: row.contactWhatsapp,
    highlights: cleanStringList(row.highlights, 8),
    about: row.about,
    faq: cleanFaq(row.faq),
    gallery: cleanGallery(row.gallery),
    agenda: cleanAgenda(row.agenda),
    promoText: row.promoText?.trim() || null,
    sponsorName: row.sponsorName?.trim() || null,
    ageGate: row.ageGate,
    rsvpDeadline: row.rsvpDeadline ? row.rsvpDeadline.toISOString() : null,
  };
}

function toAdminEvent(row: EventRow): AdminEvent {
  return {
    ...toPublicEvent(row),
    outletId: row.outletId,
    bannerUrl: row.bannerUrl,
    status: (EVENT_STATUSES as readonly string[]).includes(row.status) ? (row.status as EventStatus) : "draft",
    featuredOnHome: row.featuredOnHome,
    platformSlug: row.platformSlug,
    capacity: row.capacity,
    defaultMaxPax: row.defaultMaxPax,
    contentVersion: row.contentVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Event berstatus published (untuk halaman publik). Null bila draft/arsip/tidak ada. */
export async function getPublishedEvent(slug: string): Promise<PublicEvent | null> {
  const [row] = await getDb()
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .limit(1);
  return row ? toPublicEvent(row) : null;
}

/** Event untuk banner homepage: published, ditandai tampil, dan belum selesai. */
export async function getHomeFeaturedEvent(now = new Date()): Promise<PublicEvent | null> {
  const rows = await getDb()
    .select()
    .from(events)
    .where(and(eq(events.status, "published"), eq(events.featuredOnHome, true)));
  const upcoming = rows
    .filter((row) => row.endsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return upcoming[0] ? toPublicEvent(upcoming[0]) : null;
}

export async function listEventsForAdmin(outletId?: string): Promise<AdminEvent[]> {
  const rows = await getDb().select().from(events);
  return rows.filter(row => !outletId || !row.outletId || row.outletId === outletId).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map(toAdminEvent);
}

export async function getEventForAdmin(id: string, outletId?: string): Promise<AdminEvent | null> {
  const [row] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  return row && (!outletId || !row.outletId || row.outletId === outletId) ? toAdminEvent(row) : null;
}

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Tanggal/jam tidak valid.");

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 huruf.").max(120),
    outletId: z.string().uuid().nullable().optional(),
    bannerUrl: z.string().trim().max(800).refine(value => !value || isSafeImageSrc(value), "URL banner tidak valid.").nullable().optional(),
    tagline: z.string().trim().max(160).nullable().optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    venueName: z.string().trim().min(2).max(120),
    address: z.string().trim().min(10, "Alamat terlalu pendek.").max(300),
    mapsUrl: z
      .string()
      .trim()
      .url("Link Google Maps tidak valid.")
      .refine((value) => value.startsWith("https://"), "Link Maps harus https."),
    contactWhatsapp: z
      .string()
      .trim()
      .refine((value) => Boolean(normalizeWaNumber(value)), "Nomor WhatsApp tidak valid."),
    highlights: z.array(z.string().trim().min(1).max(60)).max(8),
    about: z.string().trim().max(1200).nullable().optional(),
    faq: z.array(z.object({ q: z.string().trim().min(3).max(200), a: z.string().trim().min(1).max(600) })).max(12),
    gallery: z
      .array(
        z.object({
          src: z.string().trim().refine(isSafeImageSrc, "Gambar harus path /… atau https."),
          alt: z.string().trim().min(3, "Teks alt gambar wajib.").max(160),
        }),
      )
      .max(12),
    agenda: z
      .array(
        z.object({
          start: z.string().trim().regex(AGENDA_TIME, "Jam mulai format HH:MM."),
          end: z.string().trim().regex(AGENDA_TIME, "Jam selesai format HH:MM."),
          title: z.string().trim().min(2).max(80),
        }),
      )
      .max(12)
      .optional()
      .superRefine((agenda, ctx) => {
        if (!agenda) return;
        const seen = new Set<string>();
        agenda.forEach((item, index) => {
          if (item.end <= item.start) {
            ctx.addIssue({ code: "custom", path: [index, "end"], message: `Sesi "${item.title}": jam selesai harus setelah jam mulai.` });
          }
          const key = item.title.trim().toLowerCase();
          if (seen.has(key)) ctx.addIssue({ code: "custom", path: [index, "title"], message: `Nama sesi "${item.title}" dobel.` });
          seen.add(key);
        });
      }),
    promoText: z.string().trim().max(120).nullable().optional(),
    sponsorName: z.string().trim().max(60).nullable().optional(),
    ageGate: z.boolean().optional(),
    featuredOnHome: z.boolean(),
    // Slug event yang sama di platform GIGS (mis. "gigs-akhir-tahun"): menghubungkan beranda & lineup.
    platformSlug: z
      .string()
      .trim()
      .max(80)
      .refine((value) => !value || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value), "Slug platform: huruf kecil, angka, tanda hubung.")
      .nullable()
      .optional(),
    rsvpDeadline: isoDate.nullable().optional(),
    // Kapasitas orang di lokasi (check-in hari-H); null = tanpa batas.
    capacity: z.number().int().min(1).max(100_000).nullable().optional(),
    defaultMaxPax: z.number().int().min(1).max(10),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: "Jam selesai harus setelah jam mulai.",
    path: ["endsAt"],
  });

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

/** Field yang mengubah fakta acara — perubahan menaikkan contentVersion. */
const FACT_FIELDS = ["title", "startsAt", "endsAt", "venueName", "address", "mapsUrl", "contactWhatsapp"] as const;

export async function updateEvent(id: string, input: EventUpdateInput, userId: string, outletId?: string) {
  return getDb().transaction(async db => {
  const [current] = await db.select().from(events).where(eq(events.id, id)).limit(1).for("update");
  if (!current || (outletId && current.outletId && current.outletId !== outletId)) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  if (outletId && input.outletId && input.outletId !== outletId) throw new EventError(403, "EVENT_OUTLET_FORBIDDEN", "Pilih outlet aktif sebelum memindahkan event.");
  if (current.status === "archived") throw new EventError(409, "EVENT_ARCHIVED", "Event sudah diarsipkan.");

  const menuEntries = await db.select().from(eventMenuEntries).where(eq(eventMenuEntries.eventId, id));
  if (menuEntries.some(entry => entry.status === "active" && (entry.startsAt < new Date(input.startsAt) || entry.endsAt > new Date(input.endsAt)))) {
    throw new EventError(409, "EVENT_MENU_OUTSIDE_PERIOD", "Sesuaikan jadwal menu aktif sebelum mengubah periode event.");
  }

  if (input.agenda?.length) {
    // Sesi rundown harus berada di dalam jam acara (zona event).
    const startClock = toZonedInputValue(input.startsAt, current.timezone).slice(11);
    const endClock = toZonedInputValue(input.endsAt, current.timezone).slice(11);
    const sameDay = toZonedInputValue(input.startsAt, current.timezone).slice(0, 10) === toZonedInputValue(input.endsAt, current.timezone).slice(0, 10);
    const outside = sameDay ? input.agenda.find((item) => item.start < startClock || item.end > endClock) : undefined;
    if (outside) {
      throw new EventError(
        400,
        "AGENDA_OUTSIDE_EVENT",
        `Sesi "${outside.title}" (${outside.start}–${outside.end}) di luar jam acara ${startClock}–${endClock}.`,
      );
    }
  }

  const next = {
    title: input.title,
    outletId: input.outletId === undefined ? current.outletId : input.outletId,
    bannerUrl: input.bannerUrl === undefined ? current.bannerUrl : input.bannerUrl || null,
    tagline: input.tagline || null,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    venueName: input.venueName,
    address: input.address,
    mapsUrl: input.mapsUrl,
    contactWhatsapp: normalizeWaNumber(input.contactWhatsapp),
    highlights: input.highlights,
    about: input.about || null,
    faq: input.faq,
    gallery: input.gallery,
    agenda: input.agenda ? cleanAgenda(input.agenda) : current.agenda,
    promoText: input.promoText === undefined ? current.promoText : input.promoText || null,
    sponsorName: input.sponsorName === undefined ? current.sponsorName : input.sponsorName || null,
    ageGate: input.ageGate ?? current.ageGate,
    featuredOnHome: input.featuredOnHome,
    platformSlug: input.platformSlug === undefined ? current.platformSlug : input.platformSlug || null,
    capacity: input.capacity === undefined ? current.capacity : input.capacity ?? null,
    rsvpDeadline: input.rsvpDeadline ? new Date(input.rsvpDeadline) : null,
    defaultMaxPax: input.defaultMaxPax,
  };

  const changedFacts = FACT_FIELDS.filter((field) => {
    const before = current[field];
    const after = next[field];
    return before instanceof Date && after instanceof Date
      ? before.getTime() !== after.getTime()
      : before !== after;
  });

  if (next.platformSlug && next.platformSlug !== current.platformSlug) {
    const [taken] = await db.select({ id: events.id }).from(events).where(and(eq(events.platformSlug, next.platformSlug), ne(events.id, id))).limit(1);
    if (taken) throw new EventError(409, "PLATFORM_SLUG_TAKEN", "Slug platform GIGS sudah dipakai event lain.");
  }
  const [row] = await db
    .update(events)
    .set({
      ...next,
      contentVersion: changedFacts.length ? current.contentVersion + 1 : current.contentVersion,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning();
  // Event diperpanjang → menu/paket aktif yang berakhir bersama event ikut diperpanjang,
  // supaya paket tidak mendadak "tidak tersedia" saat acara molor.
  if (next.endsAt > current.endsAt) {
    await db
      .update(eventMenuEntries)
      .set({ endsAt: next.endsAt, updatedAt: new Date() })
      .where(and(eq(eventMenuEntries.eventId, id), eq(eventMenuEntries.endsAt, current.endsAt), ne(eventMenuEntries.status, "archived")));
  }
  // Master event: judul baru ikut dipakai sponsor, lineup, panitia, dan tugas yang tertaut.
  if (row.title !== current.title) await renameEventReferences(db, id, row.title);
  await db.insert(auditLogs).values({ time: new Date().toISOString(), actor: userId, action: "Update event configuration", object: row.title, device: "Event Manager", status: "recorded", metadata: { eventId: id, before: current, after: row } });
  return { event: toAdminEvent(row), changedFacts: [...changedFacts] };
  });
}

export async function setEventStatus(id: string, status: EventStatus, userId: string, outletId?: string) {
  return getDb().transaction(async db => {
  const [current] = await db.select().from(events).where(eq(events.id, id)).limit(1).for("update");
  if (!current || (outletId && current.outletId && current.outletId !== outletId)) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  if (status === "published") {
    const event = toPublicEvent(current);
    if (!event.address || !event.mapsUrl || !normalizeWaNumber(event.contactWhatsapp)) {
      throw new EventError(409, "EVENT_INCOMPLETE", "Lengkapi alamat, link Maps, dan WhatsApp sebelum menerbitkan.");
    }
  }
  const [row] = await db
    .update(events)
    .set({ status, updatedBy: userId, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();
  await db.insert(auditLogs).values({ time: new Date().toISOString(), actor: userId, action: "Change event status", object: row.title, device: "Event Manager", status: "recorded", metadata: { eventId: id, before: current.status, after: status } });
  return toAdminEvent(row);
  });
}
