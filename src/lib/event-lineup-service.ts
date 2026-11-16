import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventCrew, eventCrewTasks, eventPerformers, eventSponsors } from "@/db/schema";
import {
  buildRundown,
  cleanCrewPhone,
  clockToMinutes,
  CREW_ROLES,
  eventReadiness,
  isTaskOverdue,
  LINEUP_KIND_ORDER,
  PERFORMER_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CrewRole,
  type LineupKind,
  type PerformerStatus,
  type TaskStatus,
} from "@/lib/event-lineup-rules";
import { wibDate } from "@/lib/event-sponsor-rules";
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

export const performerInputSchema = z.object({ eventName, ...performerFields, status: z.enum(PERFORMER_STATUSES).optional() });
export const performerPatchSchema = performerInputSchema
  .omit({ eventName: true })
  .partial()
  .extend({ cancelReason: optionalText(300) });

export const reorderSchema = z.object({ eventName, ids: z.array(z.string().uuid()).min(1).max(200) });

const crewFields = {
  name: z.string().trim().min(2, "Nama panitia wajib diisi.").max(80),
  role: z.enum(CREW_ROLES),
  phone: optionalText(24),
  duties: optionalText(1000),
};
export const crewInputSchema = z.object({ eventName, ...crewFields });
export const crewPatchSchema = z.object({
  name: crewFields.name.optional(),
  role: crewFields.role.optional(),
  phone: crewFields.phone,
  duties: crewFields.duties,
  status: z.enum(["aktif", "nonaktif"]).optional(),
});

export const taskInputSchema = z.object({
  eventName,
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
async function assertCrewInEvent(crewId: string | null | undefined, event: string) {
  if (!crewId) return;
  const crew = await findCrew(crewId);
  if (crew.eventName !== event) throw new LineupError("CREW_OTHER_EVENT", "Penanggung jawab harus panitia event yang sama.");
}

// ─── Baca ───────────────────────────────────────────────────────────────────

export type PerformerView = typeof eventPerformers.$inferSelect;
export type CrewView = typeof eventCrew.$inferSelect & { openTasks: number };
export type TaskView = typeof eventCrewTasks.$inferSelect & { overdue: boolean; crewName: string | null };

/** Semua nama event yang pernah dipakai (lineup, panitia, tugas, sponsor), terbaru di atas. */
async function knownEvents(): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    select event_name, max(created_at) as last from (
      select event_name, created_at from ${eventPerformers}
      union all select event_name, created_at from ${eventCrew}
      union all select event_name, created_at from ${eventCrewTasks}
      union all select event_name, created_at from ${eventSponsors}
    ) t group by event_name order by last desc limit 50`);
  const list = (rows as unknown as { rows?: Array<{ event_name: string }> }).rows ?? (rows as unknown as Array<{ event_name: string }>);
  return list.map((r) => r.event_name).filter(Boolean);
}

export async function getLineupBoard(garage: GarageSession, requested: string | null) {
  assertOwnerHuman(garage);
  const db = getDb();
  const events = await knownEvents();
  const event = requested?.trim() || events[0] || null;
  const today = wibDate();
  if (!event) {
    return { today, events, eventName: null, performers: [], rundown: [], crew: [], tasks: [], readiness: eventReadiness({ performers: [], crew: [], tasks: [], overlaps: 0 }, today) };
  }
  const [performers, crewRows, taskRows] = await Promise.all([
    db.select().from(eventPerformers).where(eq(eventPerformers.eventName, event)).orderBy(asc(eventPerformers.slotOrder), asc(eventPerformers.name)),
    db.select().from(eventCrew).where(eq(eventCrew.eventName, event)).orderBy(asc(eventCrew.role), asc(eventCrew.name)),
    db.select().from(eventCrewTasks).where(eq(eventCrewTasks.eventName, event)).orderBy(asc(eventCrewTasks.dueDate), asc(eventCrewTasks.createdAt)),
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
  return { today, events: events.includes(event) ? events : [event, ...events], eventName: event, performers, rundown, crew, tasks, readiness };
}

// ─── Penampil ───────────────────────────────────────────────────────────────

export async function createPerformer(input: z.infer<typeof performerInputSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [row] = await db
    .insert(eventPerformers)
    .values({
      eventName: input.eventName,
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
    const rows = await tx.select({ id: eventPerformers.id, eventName: eventPerformers.eventName }).from(eventPerformers).where(inArray(eventPerformers.id, input.ids)).for("update");
    if (rows.length !== new Set(input.ids).size || rows.some((r) => r.eventName !== input.eventName)) {
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
  const [row] = await getDb()
    .insert(eventCrew)
    .values({
      eventName: input.eventName,
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
  await assertCrewInEvent(input.crewId, input.eventName);
  const [row] = await getDb()
    .insert(eventCrewTasks)
    .values({
      eventName: input.eventName,
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
  if (patch.crewId !== undefined) await assertCrewInEvent(patch.crewId, before.eventName);
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

export type PublicLineupItem = { name: string; kind: LineupKind };

/**
 * Lineup terkonfirmasi untuk website (tanpa kontak/catatan). Dicocokkan dengan nama event GIGS tanpa
 * peduli huruf besar/kecil. Kosong = website memakai lineup dari platform event seperti biasa.
 */
export async function publicLineupFor(eventNameValue: string): Promise<PublicLineupItem[]> {
  const name = eventNameValue.trim();
  if (!name) return [];
  const rows = await getDb()
    .select({ name: eventPerformers.name, kind: eventPerformers.kind, slotOrder: eventPerformers.slotOrder })
    .from(eventPerformers)
    .where(
      and(
        sql`lower(${eventPerformers.eventName}) = lower(${name})`,
        eq(eventPerformers.status, "konfirmasi"),
        eq(eventPerformers.showOnWebsite, true),
      ),
    )
    .orderBy(asc(eventPerformers.slotOrder), asc(eventPerformers.name))
    .limit(16);
  return rows.map((r) => ({ name: r.name, kind: r.kind as LineupKind }));
}
