import { asc, desc, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { eventCrew, eventCrewTasks, eventPerformers, events, eventSponsors } from "@/db/schema";

// =============================================================================
// Master event (GIGS EO Fase 1, Owner 17 Nov 2026). `events` = satu-satunya identitas event untuk Sponsor,
// Lineup, Panitia, Tugas, dan beranda GIGS. `event_name` di tabel lain tetap disimpan (riwayat + data lama),
// tetapi bila `event_id` terisi nama selalu mengikuti judul master (lihat `renameEventReferences`).
// =============================================================================

export type MasterEvent = { id: string; title: string; date: string; status: string; platformSlug: string | null };

type Executor = Pick<ReturnType<typeof getDb>, "select" | "update">;

const wibDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Daftar master event untuk pilihan di layar (arsip tidak ditampilkan), terbaru di atas. */
export async function listMasterEvents(): Promise<MasterEvent[]> {
  const rows = await getDb()
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, status: events.status, platformSlug: events.platformSlug })
    .from(events)
    .where(ne(events.status, "archived"))
    .orderBy(desc(events.startsAt), asc(events.title))
    .limit(50);
  return rows.map((r) => ({ id: r.id, title: r.title, date: wibDay(r.startsAt), status: r.status, platformSlug: r.platformSlug }));
}

export class EventRefError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EventRefError";
  }
}

/**
 * Tentukan event untuk baris baru: `eventId` (pilihan master) → nama = judul master. Tanpa `eventId`, nama yang
 * sama persis (tanpa peduli huruf) dengan tepat satu judul master ikut ditautkan. Selain itu: nama bebas (data lama).
 */
export async function resolveEventRef(
  input: { eventId?: string | null; eventName?: string | null },
  db: Executor = getDb(),
): Promise<{ eventId: string | null; eventName: string }> {
  if (input.eventId) {
    const [row] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, input.eventId)).limit(1);
    if (!row) throw new EventRefError("EVENT_NOT_FOUND", "Event tidak ditemukan di daftar event.", 404);
    return { eventId: row.id, eventName: row.title };
  }
  const name = input.eventName?.trim() ?? "";
  if (name.length < 2) throw new EventRefError("EVENT_REQUIRED", "Pilih event dari daftar.");
  const matches = await db
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(sql`lower(trim(${events.title})) = lower(${name})`)
    .limit(2);
  if (matches.length === 1) return { eventId: matches[0].id, eventName: matches[0].title };
  return { eventId: null, eventName: name };
}

/** Judul master berubah → nama event di sponsor/lineup/panitia/tugas yang tertaut ikut berubah (dalam tx pemanggil). */
export async function renameEventReferences(db: Executor, eventId: string, title: string) {
  for (const table of [eventSponsors, eventPerformers, eventCrew, eventCrewTasks]) {
    await db.update(table).set({ eventName: title }).where(eq(table.eventId, eventId));
  }
}

/** Event untuk beranda GIGS: cocokkan slug platform dulu, lalu judul (tanpa peduli huruf). */
export async function findEventForPlatform(platform: { slug: string; name: string }): Promise<{ id: string; title: string } | null> {
  const db = getDb();
  if (platform.slug) {
    const [bySlug] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.platformSlug, platform.slug)).limit(1);
    if (bySlug) return bySlug;
  }
  const byName = await db
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(sql`lower(trim(${events.title})) = lower(${platform.name.trim()})`)
    .limit(2);
  return byName.length === 1 ? byName[0] : null;
}
