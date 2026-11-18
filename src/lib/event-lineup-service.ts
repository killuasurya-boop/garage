import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventCrew, eventCrewTasks, eventOpsChecks, eventPerformers, events, eventSponsorObligations, eventSponsors, staffProfiles, user } from "@/db/schema";
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
  scheduleReminders,
  taskReminders,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CrewRole,
  type LineupKind,
  type PerformerStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/event-lineup-rules";
import { OPS_CHECK_TEMPLATE } from "@/lib/event-day-rules";
import { wibDate } from "@/lib/event-sponsor-rules";
import { parseInstagramHandle } from "@/lib/gigs-lineup";
import { fetchPlatformLineup } from "@/lib/gigs-promo";
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

/** GIGS EO Fase 3 (#9): Ketua/Stage Manager = Manajer (login langsung) boleh melihat papan & mengubah STATUS tugas. */
function assertCrewHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") throw new LineupError("FORBIDDEN", "Lineup & panitia hanya untuk Owner dan Manajer.", 403);
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Lineup & panitia hanya untuk staf yang login langsung.", 403);
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
  // Baris kecil di kartu lineup website, mis. "Heavy / Metallic Roster".
  tagline: optionalText(40),
  contactName: optionalText(80),
  contactPhone: optionalText(24),
  instagram: optionalText(60),
  memberCount: z.number().int().min(1).max(50).nullable().optional(),
  slotOrder: z.number().int().min(1).max(200).nullable().optional(),
  setStart: clock,
  setMinutes: z.number().int().min(1).max(600).nullable().optional(),
  techRider: optionalText(1000),
  hospitality: optionalText(1000),
  contractUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "Tautan kontrak harus https://…")
    .nullable()
    .optional(),
  notes: optionalText(1000),
  showOnWebsite: z.boolean().optional(),
};

// Penampil baru hanya calon/konfirmasi; "batal" hanya lewat ubah status (wajib alasan).
export const performerInputSchema = z.object({ ...eventRef, ...performerFields, status: z.enum(["calon", "konfirmasi"]).optional() });
export const performerPatchSchema = performerInputSchema
  .omit({ eventName: true, eventId: true })
  .partial()
  .extend({
    status: z.enum(PERFORMER_STATUSES).optional(),
    cancelReason: optionalText(300),
    // GIGS EO #14: tombol "Kirim jadwal" menandai jadwal sudah dikirim (false = belum).
    scheduleSent: z.boolean().optional(),
  });

export const importPlatformSchema = z.object({ ...eventRef });


export const reorderSchema = z.object({ eventId: z.string().uuid().nullable().optional(), eventName, ids: z.array(z.string().uuid()).min(1).max(200) });

const crewFields = {
  name: z.string().trim().min(2, "Nama panitia wajib diisi.").max(80),
  role: z.enum(CREW_ROLES),
  phone: optionalText(24),
  duties: optionalText(1000),
  // Akun login staf yang ditautkan (opsional): membuka /panitia untuk event ini saja.
  userId: z.string().trim().min(1).max(100).nullable().optional(),
};
export const crewInputSchema = z.object({ ...eventRef, ...crewFields });
export const crewPatchSchema = z.object({
  name: crewFields.name.optional(),
  role: crewFields.role.optional(),
  phone: crewFields.phone,
  duties: crewFields.duties,
  userId: crewFields.userId,
  status: z.enum(["aktif", "nonaktif"]).optional(),
});

// ─── Tempel daftar (Owner 17 Nov 2026) ──────────────────────────────────────
const bulkLine = z.number().int().min(1).max(100_000).optional();
export const bulkPasteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("performer"),
    ...eventRef,
    status: z.enum(["calon", "konfirmasi"]).default("konfirmasi"),
    rows: z
      .array(
        z.object({
          line: bulkLine,
          name: performerFields.name,
          kind: performerFields.kind,
          tagline: performerFields.tagline,
          instagram: performerFields.instagram,
          setStart: performerFields.setStart,
          setMinutes: performerFields.setMinutes,
          contactPhone: performerFields.contactPhone,
        }),
      )
      .min(1, "Tidak ada baris untuk disimpan.")
      .max(100, "Maksimal 100 baris sekali tempel."),
  }),
  z.object({
    kind: z.literal("crew"),
    ...eventRef,
    rows: z
      .array(z.object({ line: bulkLine, name: crewFields.name, role: crewFields.role, phone: crewFields.phone, duties: crewFields.duties }))
      .min(1, "Tidak ada baris untuk disimpan.")
      .max(100, "Maksimal 100 baris sekali tempel."),
  }),
]);

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
  try {
    return parseInstagramHandle(value);
  } catch {
    throw new LineupError("INVALID_INSTAGRAM", "Akun Instagram tidak valid.");
  }
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

async function opsProgress(eventId: string) {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int`, done: sql<number>`count(${eventOpsChecks.doneAt})::int` })
    .from(eventOpsChecks)
    .where(eq(eventOpsChecks.eventId, eventId));
  const total = Number(row?.total ?? 0);
  // Checklist keselamatan belum pernah dibuka (baris dibuat saat layar Hari-H dibuka) = 10 item bawaan, belum selesai.
  // Skor kesiapan tidak boleh tergantung apakah seseorang pernah membuka /event-day.
  if (total === 0) return { done: 0, total: OPS_CHECK_TEMPLATE.length };
  return { done: Number(row?.done ?? 0), total };
}

/** Pilihan event papan: ID master (utama) atau nama lama. String = nama (tautan lama `?event=`). */
export type LineupBoardRequest = string | { eventId?: string | null; eventName?: string | null } | null;

export async function getLineupBoard(garage: GarageSession, requested: LineupBoardRequest) {
  assertCrewHuman(garage);
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
      ops: master ? await opsProgress(master.id) : undefined,
    },
    today,
  );
  // GIGS EO #13: kewajiban sponsor yang ditempel ke slot penampil (untuk MC / stage manager).
  const sponsorNotes: Record<string, Array<{ sponsor: string; title: string; done: boolean }>> = {};
  if (performers.length) {
    const noteRows = await db
      .select({ performerId: eventSponsorObligations.slotPerformerId, sponsor: eventSponsors.name, title: eventSponsorObligations.title, doneAt: eventSponsorObligations.doneAt })
      .from(eventSponsorObligations)
      .innerJoin(eventSponsors, eq(eventSponsors.id, eventSponsorObligations.sponsorId))
      .where(
        and(
          inArray(eventSponsorObligations.slotPerformerId, performers.map((p) => p.id)),
          isNull(eventSponsorObligations.archivedAt),
          ne(eventSponsors.status, "batal"),
        ),
      );
    for (const r of noteRows) {
      if (!r.performerId) continue;
      (sponsorNotes[r.performerId] ??= []).push({ sponsor: r.sponsor, title: r.title, done: Boolean(r.doneAt) });
    }
  }
  // GIGS EO #10: status honor penampil (Owner saja) dari Keuangan Event — anggaran honor tertaut vs dibayar.
  const honor: Record<string, { planned: number; paid: number }> = {};
  if (garage.profile.role === "Owner" && master) {
    const rows = await db.execute(sql`
      select l.performer_id, sum(l.planned_amount)::int as planned, coalesce(sum(pp.paid), 0)::int as paid
      from event_budget_lines l
      left join (
        select budget_line_id, sum(amount) as paid from event_expense_payments where status = 'posted' group by budget_line_id
      ) pp on pp.budget_line_id = l.id
      where l.event_id = ${master.id} and l.performer_id is not null and l.status = 'aktif'
      group by l.performer_id`);
    const list = (rows as unknown as { rows?: Array<{ performer_id: string; planned: number; paid: number }> }).rows ?? (rows as unknown as Array<{ performer_id: string; planned: number; paid: number }>);
    for (const r of list) honor[r.performer_id] = { planned: Number(r.planned), paid: Number(r.paid) };
  }
  // Akun staf aktif untuk ditautkan ke panitia (Owner saja; tanpa nomor HP).
  const accounts =
    garage.profile.role === "Owner"
      ? await db
          .select({ userId: user.id, name: user.name, email: user.email, role: staffProfiles.role })
          .from(staffProfiles)
          .innerJoin(user, eq(user.id, staffProfiles.userId))
          .where(eq(staffProfiles.status, "active"))
          .orderBy(asc(user.name))
          .limit(300)
      : [];
  return {
    today,
    honor,
    sponsorNotes,
    accounts,
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
      tagline: emptyToNull(input.tagline) ?? null,
      contactName: emptyToNull(input.contactName) ?? null,
      contactPhone: phoneOrThrow(input.contactPhone, "Kontak penampil"),
      instagram: instagramHandle(input.instagram),
      memberCount: input.memberCount ?? null,
      status: input.status ?? "calon",
      slotOrder: input.slotOrder ?? null,
      setStart: emptyToNull(input.setStart) ?? null,
      setMinutes: input.setMinutes ?? null,
      techRider: emptyToNull(input.techRider) ?? null,
      hospitality: emptyToNull(input.hospitality) ?? null,
      contractUrl: emptyToNull(input.contractUrl) ?? null,
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
  if (patch.tagline !== undefined) values.tagline = emptyToNull(patch.tagline);
  if (patch.contactName !== undefined) values.contactName = emptyToNull(patch.contactName);
  if (patch.contactPhone !== undefined) values.contactPhone = phoneOrThrow(patch.contactPhone, "Kontak penampil");
  if (patch.instagram !== undefined) values.instagram = instagramHandle(patch.instagram);
  if (patch.memberCount !== undefined) values.memberCount = patch.memberCount;
  if (patch.slotOrder !== undefined) values.slotOrder = patch.slotOrder;
  if (patch.setStart !== undefined) values.setStart = emptyToNull(patch.setStart);
  if (patch.setMinutes !== undefined) values.setMinutes = patch.setMinutes;
  if (patch.techRider !== undefined) values.techRider = emptyToNull(patch.techRider);
  if (patch.scheduleSent !== undefined) values.scheduleSentAt = patch.scheduleSent ? new Date() : null;
  if (patch.hospitality !== undefined) values.hospitality = emptyToNull(patch.hospitality);
  if (patch.contractUrl !== undefined) values.contractUrl = emptyToNull(patch.contractUrl);
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

/** Logo penampil (unggahan webp di /garage-uploads/event-lineup) atau null = hapus → website memakai logo platform. */
export async function setPerformerLogo(id: string, logoUrl: string | null, garage: GarageSession) {
  assertOwnerHuman(garage);
  const before = await findPerformer(id);
  const [row] = await getDb()
    .update(eventPerformers)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(eventPerformers.id, id))
    .returning();
  await audit(garage, logoUrl ? "Ganti logo penampil" : "Hapus logo penampil", row.name, {
    eventName: row.eventName,
    performerId: id,
    before: { logoUrl: before.logoUrl },
    after: { logoUrl: row.logoUrl },
  });
  return row;
}

/** Urutan slot baru sesuai urutan id yang dikirim (penampil lain event ini tidak disentuh). */
export async function reorderPerformers(input: z.infer<typeof reorderSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: eventPerformers.id, eventId: eventPerformers.eventId, eventName: eventPerformers.eventName }).from(eventPerformers).where(inArray(eventPerformers.id, input.ids)).for("update");
    // ID master bila dikirim (judul boleh dobel); tanpa ID: nama (klien lama / data tanpa master).
    const sameEvent = (r: { eventId: string | null; eventName: string }) => (input.eventId ? r.eventId === input.eventId : r.eventName === input.eventName);
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

/**
 * Impor lineup yang sudah tayang di platform GIGS ke Garage OS (sekali klik, agar tidak input 2x).
 * - Nama yang belum ada → penampil baru: terkonfirmasi, tampil di website, logo platform, urutan di belakang.
 * - Nama yang sudah ada (tanpa peduli huruf, status apa pun) → TIDAK diubah, kecuali logo masih kosong → diisi logo platform.
 * Setelah impor, semua data adalah data Garage OS biasa: nama, jenis, logo, tagline, IG, jadwal bebas diubah.
 */
export async function importPlatformLineup(input: z.infer<typeof importPlatformSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  const db = getDb();
  const [master] = ref.eventId ? await db.select({ platformSlug: events.platformSlug }).from(events).where(eq(events.id, ref.eventId)).limit(1) : [];
  let platform: Awaited<ReturnType<typeof fetchPlatformLineup>>;
  try {
    platform = await fetchPlatformLineup({ slug: master?.platformSlug ?? null, name: ref.eventName });
  } catch {
    throw new LineupError("PLATFORM_UNREACHABLE", "Platform GIGS tidak bisa dihubungi. Coba lagi beberapa saat.", 502);
  }
  if (!platform) {
    throw new LineupError(
      "PLATFORM_EVENT_NOT_FOUND",
      "Event ini tidak ditemukan di platform GIGS. Isi slug platform di menu Event, atau samakan judul event.",
      404,
    );
  }
  if (!platform.lineup.length) return { platformName: platform.name, created: [] as string[], logoFilled: [] as string[], skipped: [] as string[] };

  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: eventPerformers.id,
        name: eventPerformers.name,
        platformName: eventPerformers.platformName,
        logoUrl: eventPerformers.logoUrl,
        slotOrder: eventPerformers.slotOrder,
      })
      .from(eventPerformers)
      .where(ref.eventId ? eq(eventPerformers.eventId, ref.eventId) : and(isNull(eventPerformers.eventId), eq(eventPerformers.eventName, ref.eventName)))
      .for("update");
    type Existing = (typeof existing)[number];
    // Kenali talent lewat nama asli di platform dulu (tetap cocok walau Owner sudah mengganti nama, mis. SURAU → SURAI),
    // lalu lewat nama sekarang.
    const byPlatform = new Map<string, Existing>(existing.filter((r) => r.platformName).map((r) => [r.platformName!.trim().toLowerCase(), r]));
    const byName = new Map<string, Existing>(existing.map((r) => [r.name.trim().toLowerCase(), r]));
    let slot = existing.reduce((max, r) => Math.max(max, r.slotOrder ?? 0), 0);
    const created: string[] = [];
    const logoFilled: string[] = [];
    const skipped: string[] = [];
    for (const item of platform.lineup) {
      const key = item.name.trim().toLowerCase();
      // Nama resmi (SURAI) DAN ejaan asli platform (SURAU) sama-sama dikenali → tidak pernah dobel.
      const rawKey = item.platformName?.trim().toLowerCase();
      const found = byPlatform.get(key) ?? (rawKey ? byPlatform.get(rawKey) : undefined) ?? byName.get(key) ?? (rawKey ? byName.get(rawKey) : undefined);
      if (found) {
        const values: Partial<typeof eventPerformers.$inferInsert> = {};
        // Tautkan baris lama (dibuat manual / impor sebelum kolom ini) ke nama platformnya; tidak mengubah nama.
        if (!found.platformName) values.platformName = item.platformName ?? item.name;
        if (!found.logoUrl && item.logo) values.logoUrl = item.logo;
        if (Object.keys(values).length) {
          await tx.update(eventPerformers).set({ ...values, updatedAt: new Date() }).where(eq(eventPerformers.id, found.id));
          byPlatform.set(key, { ...found, ...values } as Existing);
        }
        if (values.logoUrl) logoFilled.push(found.name);
        else skipped.push(found.name);
        continue;
      }
      slot += 1;
      await tx.insert(eventPerformers).values({
        eventId: ref.eventId,
        eventName: ref.eventName,
        name: item.name,
        kind: item.kind ?? "band",
        logoUrl: item.logo,
        status: "konfirmasi",
        slotOrder: slot,
        showOnWebsite: true,
        notes: "Diimpor dari platform GIGS.",
        platformName: item.platformName ?? item.name,
        createdBy: garage.user.id,
      });
      byPlatform.set(key, { id: "", name: item.name, platformName: item.platformName ?? item.name, logoUrl: item.logo, slotOrder: slot });
      created.push(item.name);
    }
    return { created, logoFilled, skipped };
  });
  // Audit setelah transaksi (PGlite satu koneksi).
  await audit(garage, "Impor lineup dari platform GIGS", ref.eventName, { eventName: ref.eventName, platform: platform.slug, ...result });
  return { platformName: platform.name, ...result };
}

/**
 * Simpan banyak talent / panitia sekaligus dari "Tempel daftar". Semua baris divalidasi DULU (WA, Instagram); satu salah
 * = tidak ada yang disimpan (pesan per baris). Nama yang sudah ada di event (tanpa peduli huruf) dilewati, tidak ditimpa.
 * Tiap baris disimpan lewat createPerformer/createCrew yang sama (audit per baris).
 */
export async function bulkPaste(input: z.infer<typeof bulkPasteSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  const errors: string[] = [];
  input.rows.forEach((row, index) => {
    const label = `Baris ${row.line ?? index + 1}`;
    try {
      if ("contactPhone" in row) phoneOrThrow(row.contactPhone, "WA");
      if ("phone" in row) phoneOrThrow(row.phone, "WA");
      if ("instagram" in row) instagramHandle(row.instagram);
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : "tidak valid"}`);
    }
  });
  if (errors.length) throw new LineupError("ROWS_INVALID", `Belum disimpan. Perbaiki dulu: ${errors.slice(0, 8).join(" · ")}`, 400);

  const db = getDb();
  const sameEvent = (table: typeof eventPerformers | typeof eventCrew) =>
    ref.eventId ? eq(table.eventId, ref.eventId) : and(isNull(table.eventId), eq(table.eventName, ref.eventName));
  const created: string[] = [];
  const skipped: string[] = [];
  if (input.kind === "performer") {
    const existing = await db
      .select({ name: eventPerformers.name, platformName: eventPerformers.platformName, slotOrder: eventPerformers.slotOrder })
      .from(eventPerformers)
      .where(sameEvent(eventPerformers));
    const names = new Set(existing.flatMap((r) => [r.name, r.platformName ?? ""]).filter(Boolean).map((n) => n.trim().toLowerCase()));
    let slot = existing.reduce((max, r) => Math.max(max, r.slotOrder ?? 0), 0);
    for (const row of input.rows) {
      const key = row.name.trim().toLowerCase();
      if (names.has(key)) {
        skipped.push(row.name);
        continue;
      }
      slot += 1;
      await createPerformer(
        {
          eventId: ref.eventId,
          eventName: ref.eventName,
          name: row.name,
          kind: row.kind,
          tagline: row.tagline,
          instagram: row.instagram,
          setStart: row.setStart,
          setMinutes: row.setMinutes,
          contactPhone: row.contactPhone,
          status: input.status,
          slotOrder: slot,
        },
        garage,
      );
      names.add(key);
      created.push(row.name);
    }
  } else {
    const existing = await db.select({ name: eventCrew.name }).from(eventCrew).where(and(sameEvent(eventCrew), eq(eventCrew.status, "aktif")));
    const names = new Set(existing.map((r) => r.name.trim().toLowerCase()));
    for (const row of input.rows) {
      const key = row.name.trim().toLowerCase();
      if (names.has(key)) {
        skipped.push(row.name);
        continue;
      }
      await createCrew({ eventId: ref.eventId, eventName: ref.eventName, name: row.name, role: row.role, phone: row.phone, duties: row.duties }, garage);
      names.add(key);
      created.push(row.name);
    }
  }
  return { created, skipped };
}

// ─── Panitia ────────────────────────────────────────────────────────────────

export async function createCrew(input: z.infer<typeof crewInputSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const ref = await eventFor(input);
  const account = await crewAccountOrThrow(input.userId);
  const [row] = await getDb()
    .insert(eventCrew)
    .values({
      eventId: ref.eventId,
      eventName: ref.eventName,
      name: input.name,
      role: input.role,
      phone: phoneOrThrow(input.phone, "Nomor panitia"),
      duties: emptyToNull(input.duties) ?? null,
      userId: account ?? null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah panitia event", row.name, { eventName: row.eventName, crewId: row.id, role: row.role });
  return row;
}

/** Akun yang boleh ditautkan = akun staf AKTIF (bukan API key agent). null/kosong = lepas tautan. */
async function crewAccountOrThrow(userId: string | null | undefined): Promise<string | null | undefined> {
  if (userId === undefined) return undefined;
  if (!userId) return null;
  const [row] = await getDb()
    .select({ id: user.id })
    .from(user)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(and(eq(user.id, userId), eq(staffProfiles.status, "active")))
    .limit(1);
  if (!row) throw new LineupError("ACCOUNT_NOT_FOUND", "Akun staf tidak ditemukan atau tidak aktif.", 404);
  return row.id;
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
  const account = await crewAccountOrThrow(patch.userId);
  if (account !== undefined) values.userId = account;
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
  assertCrewHuman(garage);
  if (garage.profile.role !== "Owner" && Object.keys(patch).some((key) => key !== "status")) {
    throw new LineupError("FORBIDDEN", "Manajer hanya bisa mengubah status tugas.", 403);
  }
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

export type PublicLineupItem = {
  name: string;
  kind: LineupKind;
  time: string | null;
  live: boolean;
  logo: string | null;
  tagline: string | null;
  instagram: string | null;
};

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
      logoUrl: eventPerformers.logoUrl,
      tagline: eventPerformers.tagline,
      instagram: eventPerformers.instagram,
      status: eventPerformers.status,
      slotOrder: eventPerformers.slotOrder,
      setStart: eventPerformers.setStart,
      setMinutes: eventPerformers.setMinutes,
      actualStart: eventPerformers.actualStart,
      actualEnd: eventPerformers.actualEnd,
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
  // "Sedang tampil" = mode stage manager (Fase 3): sudah mulai, belum selesai.
  const live = new Set(rows.filter((r) => r.actualStart && !r.actualEnd).map((r) => r.id));
  const extra = new Map(rows.map((r) => [r.id, r]));
  return rundown.map((r) => ({
    name: r.name,
    kind: r.kind,
    time: publicSetTime(r),
    live: live.has(r.id),
    logo: extra.get(r.id)?.logoUrl ?? null,
    tagline: extra.get(r.id)?.tagline ?? null,
    instagram: extra.get(r.id)?.instagram ?? null,
  }));
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
  const today = wibDate(now);
  // GIGS EO #14: penampil terkonfirmasi (master event) yang jadwalnya belum dikirim, H-1 & hari H.
  const performerRows = await db
    .select({
      eventId: events.id,
      eventName: events.title,
      startsAt: events.startsAt,
      name: eventPerformers.name,
      contactPhone: eventPerformers.contactPhone,
      scheduleSentAt: eventPerformers.scheduleSentAt,
    })
    .from(eventPerformers)
    .innerJoin(events, eq(events.id, eventPerformers.eventId))
    .where(and(eq(eventPerformers.status, "konfirmasi"), isNull(eventPerformers.scheduleSentAt)));
  const reminders = [
    ...taskReminders(
      rows.map((r) => ({ ...r, status: r.status as TaskStatus, priority: r.priority as TaskPriority, dueDate: r.dueDate ?? null })),
      today,
    ),
    ...scheduleReminders(
      performerRows.map((r) => ({ eventId: r.eventId, eventName: r.eventName, eventDate: wibDate(r.startsAt), name: r.name, hasContact: Boolean(r.contactPhone), scheduleSent: Boolean(r.scheduleSentAt) })),
      today,
    ),
  ];
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
