import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { events } from "@/db/schema";
import type { PublicEvent } from "@/lib/event-format";
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
  status: EventStatus;
  featuredOnHome: boolean;
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
    rsvpDeadline: row.rsvpDeadline ? row.rsvpDeadline.toISOString() : null,
  };
}

function toAdminEvent(row: EventRow): AdminEvent {
  return {
    ...toPublicEvent(row),
    status: (EVENT_STATUSES as readonly string[]).includes(row.status) ? (row.status as EventStatus) : "draft",
    featuredOnHome: row.featuredOnHome,
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

export async function listEventsForAdmin(): Promise<AdminEvent[]> {
  const rows = await getDb().select().from(events);
  return rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map(toAdminEvent);
}

export async function getEventForAdmin(id: string): Promise<AdminEvent | null> {
  const [row] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  return row ? toAdminEvent(row) : null;
}

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Tanggal/jam tidak valid.");

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 huruf.").max(120),
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
    featuredOnHome: z.boolean(),
    rsvpDeadline: isoDate.nullable().optional(),
    defaultMaxPax: z.number().int().min(1).max(10),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: "Jam selesai harus setelah jam mulai.",
    path: ["endsAt"],
  });

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

/** Field yang mengubah fakta acara — perubahan menaikkan contentVersion. */
const FACT_FIELDS = ["title", "startsAt", "endsAt", "venueName", "address", "mapsUrl", "contactWhatsapp"] as const;

export async function updateEvent(id: string, input: EventUpdateInput, userId: string) {
  const db = getDb();
  const [current] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!current) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  if (current.status === "archived") throw new EventError(409, "EVENT_ARCHIVED", "Event sudah diarsipkan.");

  const next = {
    title: input.title,
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
    featuredOnHome: input.featuredOnHome,
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
  return { event: toAdminEvent(row), changedFacts: [...changedFacts] };
}

export async function setEventStatus(id: string, status: EventStatus, userId: string) {
  const db = getDb();
  const [current] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!current) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
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
  return toAdminEvent(row);
}
