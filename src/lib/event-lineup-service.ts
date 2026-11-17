import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventCrew, eventCrewTasks, eventPerformers, eventSponsors, events, staffProfiles } from "@/db/schema";
import {
  buildRundown,
  cleanCrewPhone,
  clockToMinutes,
  CREW_ROLES,
  eventReadiness,
  isTaskOverdue,
  LINEUP_KIND_ORDER,
  PERFORMER_STATUSES,
  publicSetTime,
  taskReminders,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CrewRole,
  type LineupKind,
  type PerformerStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/event-lineup-rules";
import { wibDate } from "@/lib/event-sponsor-rules";
import { EventRefError, findEventForPlatform, listMasterEvents, resolveEventRef } from "@/lib/event-master";
import { createAuditLog } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Lineup & Panitia Event (owner 16 Nov 2026). OWNER SAJA, login langsung (bukan API key agent).
// Event GIGS hidup di platform terpisah: nama event disimpan sebagai teks (sama dengan Sponsor Event).
// Tidak ada uang di modul ini. Penampil "batal" tidak pernah dihapus (alasan wajib, tercatat di audit).
// =============================================================================

export class LineupError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "LineupError";
  }
}

function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new LineupError("FORBIDDEN", "Lineup & panitia hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Lineup & panitia hanya untuk Owner yang login langsung.", 403);
}

async function audit(garage: GarageSession, action: string, object: string, metadata: Record<string, unknown>) {
  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action,
    object,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "event-lineup", ...metadata },
  });
}

// ─── Skema input ────────────────────────────────────────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const clock = z
  .string()
  .trim()
  .refine((v) => v === "" || clockToMinutes(v) !== null, "Jam tidak valid (format JJ:MM).")
  .nullable()
  .optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (format YYYY-MM-DD).");
const eventName = z.string().trim().min(2, "Nama event wajib diisi.").max(120);
// Tulis baru: pilih master event (`eventId`); nama bebas hanya untuk data lama tanpa master.
const eventRef = { eventId: z.string().uuid().nullable().optional(), eventName: eventName.optional() };

const performerFields = {
  name: z.string().trim().min(2, "Nama penampil wajib diisi.").max(80),
  kind: z.enum(LINEUP_KIND_ORDER as [LineupKind, ...LineupKind[]]),
  eventDate: isoDate.nullable().optional(),
  genre: optionalText(60),
  contactName: optionalText(80),
  contactPhone: optionalText(24),
  instagram: optionalText(60),
  memberCount: z.number().int().min(1).max(50).nullable().optional(),
  slotOrder: z.number().int().min(1).max(200).nullable().optional(),
  setStart: clock,
  setMinutes: z.number().int().min(1).max(600).nullable().optional(),
  techRider: optionalText(1000),
  notes: optionalText(1000),
  showOnWebsite: z.boolean().optional(),
};

// Penampil baru hanya calon/konfirmasi; "batal" hanya lewat ubah status (wajib alasan).
export const performerInputSchema = z.object({ ...eventRef, ...performerFields, status: z.enum(["calon", "konfirmasi"]).optional() });
export const performerPatchSchema = performerInputSchema
  .omit({ eventName: true, eventId: true })
  .partial()
  .extend({ status: z.enum(PERFORMER_STATUSES).optional(), cancelReason: optionalText(300) });

export const reorderSchema = z.object({ eventId: z.string().uuid().nullable().optional(), eventName, ids: z.array(z.string().uuid()).min(1).max(200) });

const crewFields = {
  name: z.string().trim().min(2, "Nama panitia wajib diisi.").max(80),
  role: z.enum(CREW_ROLES),
  phone: optionalText(24),
  duties: optionalText(1000),
};
export const crewInputSchema = z.object({ ...eventRef, ...crewFields });
export const crewPatchSchema = z.object({
  name: crewFields.name.optional(),
  role: crewFields.role.optional(),
  phone: crewFields.phone,
  duties: crewFields.duties,
  status: z.enum(["aktif", "nonaktif"]).optional(),
});

export const taskInputSchema = z.object({
  ...eventRef,
  title: z.string().trim().min(3, "Judul tugas wajib diisi.").max(160),
  crewId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  notes: optionalText(1000),
});
export const taskPatchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  crewId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  notes: optionalText(1000),
});

// ─── Helper ────────────────────────────────────────────────────────────────

async function eventFor(input: { eventId?: string | null; eventName?: string | null }) {
  try {
    return await resolveEventRef(input);
  } catch (error) {
    if (error instanceof EventRefError) throw new LineupError(error.code, error.message, error.status);
    throw error;
  }
}

function phoneOrThrow(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const phone = cleanCrewPhone(value);
  if (!phone) throw new LineupError("INVALID_PHONE", `${field}: nomor WhatsApp tidak valid (contoh 0812xxxxxxx).`);
  return phone;
}

const instagramHandle = (value: string | null | undefined) => {
  if (!value) return null;
  const handle = value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new LineupError("INVALID_INSTAGRAM", "Akun Instagram tidak valid.");
  return handle;
};

const emptyToNull = (value: string | null | undefined) => (value === undefined ? undefined : value && value.trim() ? value.trim() : null);

async function findPerformer(id: string) {
  const [row] = await getDb().select().from(eventPerformers).where(eq(eventPerformers.id, id)).limit(1);
  if (!row) throw new LineupError("NOT_FOUND", "Penampil tidak ditemukan.", 404);
  return row;
}
async function findCrew(id: string) {
  const [row] = await getDb().select().from(eventCrew).where(eq(eventCrew.id, id)).limit(1);
  if (!row) throw new LineupError("NOT_FOUND", "Panitia tidak ditemukan.", 404);
  return row;
}
async function findTask(id: string) {
  const [row] = await getDb().select().from(eventCrewTasks).where(eq(eventCrewTasks.id, id)).limit(1);
  if (!row) throw new LineupError("NOT_FOUND", "Tugas tidak ditemukan.", 404);
  return row;
}
/** Panitia harus dari event yang sama: dibandingkan per ID master bila ada, per nama hanya untuk data lama. */
async function assertCrewInEvent(crewId: string | null | undefined, event: { eventId: string | null; eventName: string }) {
  if (!crewId) return;
  const crew = await findCrew(crewId);
  const same = event.eventId ? crew.eventId === event.eventId : crew.eventId === null && crew.eventName === event.eventName;
  if (!same) throw new LineupError("CREW_OTHER_EVENT", "Penanggung jawab harus panitia event yang sama.");
}

// ─── Baca ───────────────────────────────────────────────────────────────────

export type PerformerView = typeof eventPerformers.$inferSelect;
export type CrewView = typeof eventCrew.$inferSelect & { openTasks: number };
export type TaskView = typeof eventCrewTasks.$inferSelect & { overdue: boolean; crewName: string | null };

/** Nama event lama yang belum tertaut ke master (lineup, panitia, tugas, sponsor), terbaru di atas. */
async function knownEvents(): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select event_name, max(created_at) as last from (
      select event_name, created_at from ${eventPerformers} where event_id is null
      union all select event_name, created_at from ${eventCrew} where event_id is null
      union all select event_name, created_at from ${eventCrewTasks} where event_id is null
      union all select event_name, created_at from ${eventSponsors} where event_id is null
    ) t group by event_name order by last desc limit 50`);
  const list = (rows as unknown as { rows?: Array<{ event_name: string }> }).rows ?? (rows as unknown as Array<{ event_name: string }>);
  return list.map((r) => r.event_name).filter(Boolean);
}

/** Pilihan event papan: ID master (utama) atau nama lama. String = nama (tautan lama `?event=`). */
export type LineupBoardRequest = string | { eventId?: string | null; eventName?: string | null } | null;

export async function getLineupBoard(garage: GarageSession, requested: LineupBoardRequest) {
  assertOwnerHuman(garage);
  const db = getDb();
  const req = typeof requested === "string" ? { eventName: requested } : (requested ?? {});
  const [legacyEvents, masterEvents] = await Promise.all([knownEvents(), listMasterEvents()]);
  const today = wibDate();
  // Identitas = ID master. Judul boleh dobel, jadi nama hanya dipakai untuk tautan lama / data tanpa master.
  let master: { id: string; title: string } | null = null;
  let legacyName: string | null = null;
  if (req.eventId) {
    master = masterEvents.find((e) => e.id === req.eventId) ?? null;
    if (!master) {
      // Event arsip / di luar 50 teratas tetap bisa dibuka lewat ID-nya.
      const [row] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, req.eventId)).limit(1);
      if (!row) throw new LineupError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
      master = row;
    }
  } else if (req.eventName?.trim()) {
    const name = req.eventName.trim();
    if (legacyEvents.includes(name)) legacyName = name;
    else master = masterEvents.find((e) => e.title.toLowerCase() === name.toLowerCase()) ?? null;
    if (!master && !legacyName) legacyName = name;
  } else if (masterEvents[0]) {
    master = masterEvents[0];
  } else if (legacyEvents[0]) {
    legacyName = legacyEvents[0];
  }
  const event = master?.title ?? legacyName;
  const events_ = [...masterEvents.map((e) => e.title), ...legacyEvents];
  if (!event) {
    return { today, events: events_, masterEvents, legacyEvents, eventId: null, eventName: null, performers: [], rundown: [], crew: [], tasks: [], readiness: eventReadiness({ performers: [], crew: [], tasks: [], overlaps: 0 }, today) };
  }
  const scope = <T extends { eventId: unknown; eventName: unknown }>(table: T): SQL =>
    master
      ? eq(table.eventId as typeof eventPerformers.eventId, master.id)
      : (and(eq(table.eventName as typeof eventPerformers.eventName, event), isNull(table.eventId as typeof eventPerformers.eventId)) as SQL);
  const [performers, crewRows, taskRows] = await Promise.all([
    db.select().from(eventPerformers).where(scope(eventPerformers)).orderBy(asc(eventPerformers.slotOrder), asc(eventPerformers.name)),
    db.select().from(eventCrew).where(scope(eventCrew)).orderBy(asc(eventCrew.role), asc(eventCrew.name)),
    db.select().from(eventCrewTasks).where(scope(eventCrewTasks)).orderBy(asc(eventCrewTasks.dueDate), asc(eventCrewTasks.createdAt)),
  ]);
  const crewName = new Map(crewRows.map((c) => [c.id, c.name]));
  const tasks: TaskView[] = taskRows.map((t) => ({
    ...t,
    overdue: isTaskOverdue({ status: t.status as TaskStatus, dueDate: t.dueDate }, today),
    crewName: t.crewId ? crewName.get(t.crewId) ?? null : null,
  }));
  const crew: CrewView[] = crewRows.map((c) => ({
    ...c,
    openTasks: taskRows.filter((t) => t.crewId === c.id && (t.status === "todo" || t.status === "proses")).length,
  }));
  const rundown = buildRundown(
    performers.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind as LineupKind,
      status: p.status as PerformerStatus,
      slotOrder: p.slotOrder,
      setStart: p.setStart,
      setMinutes: p.setMinutes,
    })),
  );
  const readiness = eventReadiness(
    {
      performers: performers.map((p) => ({ status: p.status as PerformerStatus, setStart: p.setStart, setMinutes: p.setMinutes, contactPhone: p.contactPhone })),
      crew: crewRows.map((c) => ({ role: c.role as CrewRole, status: c.status as "aktif" | "nonaktif" })),
      tasks: taskRows.map((t) => ({ status: t.status as TaskStatus, dueDate: t.dueDate })),
      overlaps: rundown.filter((r) => r.overlap).length,
    },
    today,
  );
  return {
    today,
    events: events_.includes(event) ? events_ : [event, ...events_],
    masterEvents,
    legacyEvents,
    eventId: master?.id ?? null,
    eventName: event,
    performers,
    rundown,
    crew,
    tasks,
    readiness,
  };
}

// ─── Penampil ───────────────────────────────────────────────────────────────

export async function createPerformer(input: z.infer<typeof performerInputSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  const db = getDb();
  const [row] = await db
    .insert(eventPerformers)
    .values({
      eventId: ref.eventId,
      eventName: ref.eventName,
      eventDate: input.eventDate ?? null,
      name: input.name,
      kind: input.kind,
      genre: emptyToNull(input.genre) ?? null,
      contactName: emptyToNull(input.contactName) ?? null,
      contactPhone: phoneOrThrow(input.contactPhone, "Kontak penampil"),
      instagram: instagramHandle(input.instagram),
      memberCount: input.memberCount ?? null,
      status: input.status ?? "calon",
      slotOrder: input.slotOrder ?? null,
      setStart: emptyToNull(input.setStart) ?? null,
      setMinutes: input.setMinutes ?? null,
      techRider: emptyToNull(input.techRider) ?? null,
      notes: emptyToNull(input.notes) ?? null,
      showOnWebsite: input.showOnWebsite ?? true,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah penampil event", row.name, { eventName: row.eventName, performerId: row.id, kind: row.kind, status: row.status });
  return row;
}

export async function updatePerformer(id: string, patch: z.infer<typeof performerPatchSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const before = await findPerformer(id);
  const nextStatus = patch.status ?? before.status;
  const reason = emptyToNull(patch.cancelReason);
  if (nextStatus === "batal" && before.status !== "batal" && !reason) {
    throw new LineupError("CANCEL_REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  }
  const values: Partial<typeof eventPerformers.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.kind !== undefined) values.kind = patch.kind;
  if (patch.eventDate !== undefined) values.eventDate = patch.eventDate;
  if (patch.genre !== undefined) values.genre = emptyToNull(patch.genre);
  if (patch.contactName !== undefined) values.contactName = emptyToNull(patch.contactName);
  if (patch.contactPhone !== undefined) values.contactPhone = phoneOrThrow(patch.contactPhone, "Kontak penampil");
  if (patch.instagram !== undefined) values.instagram = instagramHandle(patch.instagram);
  if (patch.memberCount !== undefined) values.memberCount = patch.memberCount;
  if (patch.slotOrder !== undefined) values.slotOrder = patch.slotOrder;
  if (patch.setStart !== undefined) values.setStart = emptyToNull(patch.setStart);
  if (patch.setMinutes !== undefined) values.setMinutes = patch.setMinutes;
  if (patch.techRider !== undefined) values.techRider = emptyToNull(patch.techRider);
  if (patch.notes !== undefined) values.notes = emptyToNull(patch.notes);
  if (patch.showOnWebsite !== undefined) values.showOnWebsite = patch.showOnWebsite;
  if (patch.status !== undefined) {
    values.status = patch.status;
    values.cancelReason = patch.status === "batal" ? reason ?? before.cancelReason : null;
  }
  const [row] = await getDb().update(eventPerformers).set(values).where(eq(eventPerformers.id, id)).returning();
  const changed = Object.keys(values).filter((k) => k !== "updatedAt");
  await audit(garage, patch.status && patch.status !== before.status ? `Status penampil → ${patch.status}` : "Ubah penampil event", row.name, {
    eventName: row.eventName,
    performerId: id,
    changed,
    before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (row as Record<string, unknown>)[k]])),
    reason: reason ?? undefined,
  });
  return row;
}

/** Urutan slot baru sesuai urutan id yang dikirim (penampil lain event ini tidak disentuh). */
export async function reorderPerformers(input: z.infer<typeof reorderSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: eventPerformers.id, eventId: eventPerformers.eventId, eventName: eventPerformers.eventName }).from(eventPerformers).where(inArray(eventPerformers.id, input.ids)).for("update");
    const sameEvent = (r: { eventId: string | null; eventName: string }) => (input.eventId ? r.eventId === input.eventId : r.eventId === null && r.eventName === input.eventName);
    if (rows.length !== new Set(input.ids).size || rows.some((r) => !sameEvent(r))) {
      throw new LineupError("REORDER_MISMATCH", "Daftar penampil tidak cocok dengan event ini. Muat ulang lalu coba lagi.", 409);
    }
    for (const [index, id] of input.ids.entries()) {
      await tx.update(eventPerformers).set({ slotOrder: index + 1, updatedAt: new Date() }).where(eq(eventPerformers.id, id));
    }
    return { count: input.ids.length };
  });
  // Audit setelah transaksi selesai (koneksi terpisah; jangan di dalam tx).
  await audit(garage, "Atur urutan lineup", input.eventName, { eventName: input.eventName, order: input.ids });
  return result;
}

// ─── Panitia ────────────────────────────────────────────────────────────────

export async function createCrew(input: z.infer<typeof crewInputSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  const [row] = await getDb()
    .insert(eventCrew)
    .values({
      eventId: ref.eventId,
      eventName: ref.eventName,
      name: input.name,
      role: input.role,
      phone: phoneOrThrow(input.phone, "Nomor panitia"),
      duties: emptyToNull(input.duties) ?? null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah panitia event", row.name, { eventName: row.eventName, crewId: row.id, role: row.role });
  return row;
}

export async function updateCrew(id: string, patch: z.infer<typeof crewPatchSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const before = await findCrew(id);
  const values: Partial<typeof eventCrew.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.phone !== undefined) values.phone = phoneOrThrow(patch.phone, "Nomor panitia");
  if (patch.duties !== undefined) values.duties = emptyToNull(patch.duties);
  if (patch.status !== undefined) values.status = patch.status;
  const [row] = await getDb().update(eventCrew).set(values).where(eq(eventCrew.id, id)).returning();
  const changed = Object.keys(values).filter((k) => k !== "updatedAt");
  await audit(garage, "Ubah panitia event", row.name, {
    eventName: row.eventName,
    crewId: id,
    changed,
    before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (row as Record<string, unknown>)[k]])),
  });
  return row;
}

// ─── Tugas panitia ──────────────────────────────────────────────────────────

export async function createTask(input: z.infer<typeof taskInputSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  await assertCrewInEvent(input.crewId, ref);
  const [row] = await getDb()
    .insert(eventCrewTasks)
    .values({
      eventId: ref.eventId,
      eventName: ref.eventName,
      title: input.title,
      crewId: input.crewId ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? "normal",
      notes: emptyToNull(input.notes) ?? null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah tugas panitia", row.title, { eventName: row.eventName, taskId: row.id, crewId: row.crewId });
  return row;
}

export async function updateTask(id: string, patch: z.infer<typeof taskPatchSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const before = await findTask(id);
  if (patch.crewId !== undefined) await assertCrewInEvent(patch.crewId, before);
  const values: Partial<typeof eventCrewTasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.crewId !== undefined) values.crewId = patch.crewId;
  if (patch.dueDate !== undefined) values.dueDate = patch.dueDate;
  if (patch.priority !== undefined) values.priority = patch.priority;
  if (patch.notes !== undefined) values.notes = emptyToNull(patch.notes);
  if (patch.status !== undefined) {
    values.status = patch.status;
    values.doneAt = patch.status === "selesai" ? before.doneAt ?? new Date() : null;
  }
  const [row] = await getDb().update(eventCrewTasks).set(values).where(eq(eventCrewTasks.id, id)).returning();
  await audit(garage, patch.status && patch.status !== before.status ? `Tugas panitia → ${patch.status}` : "Ubah tugas panitia", row.title, {
    eventName: row.eventName,
    taskId: id,
    changed: Object.keys(values).filter((k) => k !== "updatedAt"),
  });
  return row;
}

// ─── Website (publik) ───────────────────────────────────────────────────────

export type PublicLineupItem = { name: string; kind: LineupKind; time: string | null };

/**
 * Lineup terkonfirmasi untuk website (tanpa kontak/catatan). Dicocokkan dengan nama event GIGS tanpa
 * peduli huruf besar/kecil. Jam tampil dari rundown (urutan slot, lewat tengah malam). Kosong = website
 * memakai lineup dari platform event seperti biasa.
 */
export async function publicLineupFor(platform: string | { slug: string; name: string }): Promise<PublicLineupItem[]> {
  const ref = typeof platform === "string" ? { slug: "", name: platform } : platform;
  // Master event (slug platform GIGS → event Garage OS) dulu; tanpa master: cocok nama seperti sebelumnya.
  const master = await findEventForPlatform(ref).catch(() => null);
  const name = (master?.title ?? ref.name).trim();
  if (!name) return [];
  const rows = await getDb()
    .select({
      id: eventPerformers.id,
      name: eventPerformers.name,
      kind: eventPerformers.kind,
      status: eventPerformers.status,
      slotOrder: eventPerformers.slotOrder,
      setStart: eventPerformers.setStart,
      setMinutes: eventPerformers.setMinutes,
    })
    .from(eventPerformers)
    .where(
      and(
        master
          ? sql`(${eventPerformers.eventId} = ${master.id} or lower(${eventPerformers.eventName}) = lower(${name}))`
          : sql`lower(${eventPerformers.eventName}) = lower(${name})`,
        eq(eventPerformers.status, "konfirmasi"),
        eq(eventPerformers.showOnWebsite, true),
      ),
    )
    .orderBy(asc(eventPerformers.slotOrder), asc(eventPerformers.name))
    .limit(16);
  const rundown = buildRundown(
    rows.map((r) => ({ ...r, kind: r.kind as LineupKind, status: r.status as PerformerStatus })),
  );
  return rundown.map((r) => ({ name: r.name, kind: r.kind, time: publicSetTime(r) }));
}

// ─── Pengingat tugas panitia (otomatis, ke HP Owner) ────────────────────────

/**
 * Tugas Belum/Proses yang tenggatnya besok, hari ini, atau terlambat 1/3/7 hari → notifikasi ke setiap Owner
 * aktif. Aman diulang (kunci dedup per tugas + tahap + Owner). Dipanggil penjadwal tiap 15 menit.
 */
export async function sweepLineupTaskReminders(now = new Date()) {
  const db = getDb();
  const rows = await db
    .select({
      id: eventCrewTasks.id,
      eventId: eventCrewTasks.eventId,
      eventName: eventCrewTasks.eventName,
      title: eventCrewTasks.title,
      status: eventCrewTasks.status,
      priority: eventCrewTasks.priority,
      dueDate: eventCrewTasks.dueDate,
      crewName: eventCrew.name,
    })
    .from(eventCrewTasks)
    .leftJoin(eventCrew, eq(eventCrewTasks.crewId, eventCrew.id))
    .where(inArray(eventCrewTasks.status, ["todo", "proses"]));
  const reminders = taskReminders(
    rows.map((r) => ({ ...r, status: r.status as TaskStatus, priority: r.priority as TaskPriority, dueDate: r.dueDate ?? null })),
    wibDate(now),
  );
  if (!reminders.length) return { sent: 0 };
  const eventIdOf = new Map(rows.map((r) => [r.id, r.eventId]));
  const owners = await db
    .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
  const { notifyStaff } = await import("@/lib/staff-notifications");
  let sent = 0;
  let failed = 0;
  let lastError: unknown = null;
  for (const reminder of reminders) {
    for (const owner of owners) {
      // Gagal simpan ≠ sudah terkirim (dedup): dicatat, penerima lain tetap dicoba, lalu dilempar ke runMonitoredJob.
      const row = await notifyStaff({
        outletId: owner.outletId,
        audience: "user",
        userId: owner.userId,
        kind: "lineup_task_reminder",
        severity: reminder.severity,
        title: reminder.title,
        body: reminder.body,
        url: eventIdOf.get(reminder.taskId)
          ? `/control/lineup?eventId=${eventIdOf.get(reminder.taskId)}&tab=tugas`
          : `/control/lineup?event=${encodeURIComponent(reminder.eventName)}&tab=tugas`,
        dedupKey: `${reminder.key}:${owner.userId}`,
      }).catch((error: unknown) => {
        failed += 1;
        lastError = error;
        return null;
      });
      if (row) sent += 1;
    }
  }
  if (failed) {
    throw new Error(`${failed} pengingat tugas panitia gagal disimpan (${sent} terkirim): ${lastError instanceof Error ? lastError.message : "galat"}`);
  }
  return { sent };
}
