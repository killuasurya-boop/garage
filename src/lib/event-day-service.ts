import { and, asc, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventCheckins, eventInvitations, eventOpsChecks, eventPerformers, eventRsvps, events } from "@/db/schema";
import { checkinDecision, clockDot, extractInvitationToken, OPS_CHECK_TEMPLATE, stageState } from "@/lib/event-day-rules";
import { findInvitationByToken } from "@/lib/event-invitations";
import { buildRundown, type LineupKind, type PerformerStatus } from "@/lib/event-lineup-rules";
import { listMasterEvents } from "@/lib/event-master";
import { wibDate } from "@/lib/event-sponsor-rules";
import { createAuditLog } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Hari-H event (GIGS EO Fase 3, Owner 17 Nov 2026): check-in pintu, mode stage manager, salin rundown ke agenda.
// Akses panitia: Owner atau Manajer (login langsung; API key agent ditolak). Tidak ada uang di modul ini.
// Check-in append-only (koreksi = batal + alasan). Jadwal rencana penampil tidak pernah diubah oleh mode stage.
// =============================================================================

export class EventDayError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EventDayError";
  }
}

export function assertEventCrew(garage: GarageSession) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") {
    throw new EventDayError("FORBIDDEN", "Hari-H event hanya untuk Owner dan Manajer.", 403);
  }
  if (garage.profile.agentKey) throw new EventDayError("HUMAN_SESSION_REQUIRED", "Hari-H event hanya untuk staf yang login langsung.", 403);
}

async function audit(garage: GarageSession, action: string, object: string, metadata: Record<string, unknown>) {
  await createAuditLog({
    actor: garage.user.name ?? garage.profile.role,
    action,
    object,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "event-day", ...metadata },
  });
}

async function loadEvent(eventId: string, garage: GarageSession) {
  const [row] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) throw new EventDayError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  // Manajer hanya event outletnya (event tanpa outlet = semua).
  if (garage.profile.role === "Manajer" && row.outletId && row.outletId !== garage.profile.outlet.id) {
    throw new EventDayError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  }
  return row;
}

const performerOfEvent = (event: { id: string; title: string }) =>
  or(eq(eventPerformers.eventId, event.id), and(isNull(eventPerformers.eventId), sql`lower(${eventPerformers.eventName}) = lower(${event.title})`));

// ─── Baca ───────────────────────────────────────────────────────────────────

export async function getEventDay(garage: GarageSession, eventId: string | null, now = new Date()) {
  assertEventCrew(garage);
  // Manajer: daftar & default hanya event outletnya (event outlet lain tidak bisa dibuka → jangan jadi default).
  const masterEvents = await listMasterEvents({ outletId: garage.profile.role === "Manajer" ? garage.profile.outlet.id : null });
  const id = eventId ?? masterEvents[0]?.id ?? null;
  if (!id) return { masterEvents, event: null };
  const event = await loadEvent(id, garage);
  const db = getDb();
  const eventDate = wibDate(event.startsAt);
  const [checkins, performers, rsvpRows] = await Promise.all([
    db.select().from(eventCheckins).where(eq(eventCheckins.eventId, id)).orderBy(desc(eventCheckins.createdAt)),
    db.select().from(eventPerformers).where(performerOfEvent(event)),
    db
      .select({ pax: sql<number>`coalesce(sum(${eventRsvps.pax}), 0)::int`, n: sql<number>`count(*)::int` })
      .from(eventRsvps)
      .innerJoin(eventInvitations, eq(eventInvitations.id, eventRsvps.invitationId))
      .where(and(eq(eventInvitations.eventId, id), eq(eventRsvps.response, "attending"), ne(eventInvitations.status, "revoked"))),
  ]);
  const active = checkins.filter((c) => c.status === "aktif");
  const totalActive = active.reduce((s, c) => s + c.pax, 0);
  const rundown = buildRundown(
    performers.map((p) => ({ id: p.id, name: p.name, kind: p.kind as LineupKind, status: p.status as PerformerStatus, slotOrder: p.slotOrder, setStart: p.setStart, setMinutes: p.setMinutes })),
  ).filter((r) => r.status === "konfirmasi");
  const byId = new Map(performers.map((p) => [p.id, p]));
  const stage = stageState(
    rundown.map((r) => ({ id: r.id, name: r.name, slot: r.slot, startAbs: r.startAbs, endAbs: r.endAbs, actualStart: byId.get(r.id)!.actualStart, actualEnd: byId.get(r.id)!.actualEnd })),
    eventDate,
  );
  const projected = new Map(stage.projected.map((p) => [p.id, p.projectedStartAbs]));
  return {
    masterEvents,
    now: now.toISOString(),
    role: garage.profile.role,
    event: { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), capacity: event.capacity, date: eventDate },
    checkin: {
      totalActive,
      capacity: event.capacity,
      byKind: { undangan: active.filter((c) => c.kind === "undangan").reduce((s, c) => s + c.pax, 0), walkin: active.filter((c) => c.kind === "walkin").reduce((s, c) => s + c.pax, 0) },
      rsvpAttendingPax: Number(rsvpRows[0]?.pax ?? 0),
      rsvpAttendingInvitations: Number(rsvpRows[0]?.n ?? 0),
      recent: checkins.slice(0, 40).map((c) => ({ id: c.id, guestName: c.guestName, pax: c.pax, kind: c.kind, status: c.status, voidReason: c.voidReason, at: c.createdAt.toISOString() })),
    },
    stage: {
      ...stage,
      slots: rundown.map((r) => {
        const p = byId.get(r.id)!;
        return {
          id: r.id,
          slot: r.slot,
          name: r.name,
          kind: r.kind,
          plannedStart: clockDot(r.startAbs),
          plannedEnd: clockDot(r.endAbs),
          projectedStart: clockDot(projected.get(r.id) ?? null),
          actualStart: p.actualStart?.toISOString() ?? null,
          actualEnd: p.actualEnd?.toISOString() ?? null,
          live: stage.liveId === r.id,
          next: stage.nextId === r.id,
        };
      }),
    },
  };
}

// ─── Check-in ───────────────────────────────────────────────────────────────

export const checkinSchema = z.object({
  eventId: z.string().uuid(),
  code: z.string().trim().max(400).optional(),
  walkInName: z.string().trim().min(2).max(80).optional(),
  pax: z.number().int().min(1).max(50),
});

export async function checkIn(input: z.infer<typeof checkinSchema>, garage: GarageSession) {
  assertEventCrew(garage);
  const event = await loadEvent(input.eventId, garage);
  if (event.status === "archived") throw new EventDayError("EVENT_ARCHIVED", "Event sudah diarsipkan.", 409);
  let invitationId: string | null = null;
  let guestName: string;
  let maxPax: number | null = null;
  if (input.code) {
    const token = extractInvitationToken(input.code);
    if (!token) throw new EventDayError("NOT_INVITATION", "Kode tidak dikenali sebagai undangan.");
    const row = await findInvitationByToken(token);
    if (!row) throw new EventDayError("INVITATION_INVALID", "Undangan tidak berlaku (dicabut, tamu diarsipkan, atau salah).", 404);
    if (row.event.id !== event.id) throw new EventDayError("INVITATION_OTHER_EVENT", `Undangan ini untuk event lain (${row.event.title}).`, 409);
    invitationId = row.invitation.id;
    guestName = row.guest.fullName;
    maxPax = row.guest.maxPax;
  } else if (input.walkInName) {
    guestName = input.walkInName;
  } else {
    throw new EventDayError("CODE_REQUIRED", "Scan QR undangan atau isi nama tamu walk-in.");
  }
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    // Satu antrean per event: dua panitia scan bersamaan tidak melampaui kapasitas / batas undangan.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event_checkin:${event.id}`}))`);
    const [totals] = await tx
      .select({
        total: sql<number>`coalesce(sum(${eventCheckins.pax}), 0)::int`,
        mine: invitationId
          ? sql<number>`coalesce(sum(case when ${eventCheckins.invitationId} = ${invitationId} then ${eventCheckins.pax} else 0 end), 0)::int`
          : sql<number>`0`,
      })
      .from(eventCheckins)
      .where(and(eq(eventCheckins.eventId, event.id), eq(eventCheckins.status, "aktif")));
    const decision = checkinDecision({ pax: input.pax, alreadyForInvitation: Number(totals?.mine ?? 0), maxPax, totalActive: Number(totals?.total ?? 0), capacity: event.capacity });
    if (!decision.ok) throw new EventDayError(decision.code, decision.message, 409);
    const [created] = await tx
      .insert(eventCheckins)
      .values({ eventId: event.id, invitationId, guestName, pax: input.pax, kind: invitationId ? "undangan" : "walkin", checkedBy: garage.user.id })
      .returning();
    return created;
  });
  await audit(garage, "Check-in tamu event", guestName, { eventId: event.id, checkinId: row.id, pax: row.pax, kind: row.kind });
  return { id: row.id, guestName: row.guestName, pax: row.pax, kind: row.kind };
}

export async function voidCheckin(id: string, reason: string, garage: GarageSession) {
  assertEventCrew(garage);
  if (!reason || reason.trim().length < 3) throw new EventDayError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  const db = getDb();
  const [row] = await db.select().from(eventCheckins).where(eq(eventCheckins.id, id)).limit(1);
  if (!row) throw new EventDayError("NOT_FOUND", "Check-in tidak ditemukan.", 404);
  await loadEvent(row.eventId, garage);
  const changed = await db
    .update(eventCheckins)
    .set({ status: "batal", voidReason: reason.trim(), voidedBy: garage.user.id, voidedAt: new Date() })
    .where(and(eq(eventCheckins.id, id), eq(eventCheckins.status, "aktif")))
    .returning({ id: eventCheckins.id });
  if (!changed.length) throw new EventDayError("ALREADY_VOID", "Check-in ini sudah dibatalkan.", 409);
  await audit(garage, "Batalkan check-in tamu event", row.guestName, { eventId: row.eventId, checkinId: id, reason: reason.trim() });
  return { id, status: "batal" as const };
}

// ─── Mode stage manager ────────────────────────────────────────────────────

export const slotActionSchema = z.object({ action: z.enum(["start", "end", "undo"]) });

/**
 * Mulai: penampil ini tampil sekarang; yang masih tampil di event yang sama otomatis selesai. Selesai: catat jam selesai.
 * Undo: hapus jam nyata penampil ini (salah tekan). Jadwal rencana tidak diubah.
 */
export async function setSlotState(performerId: string, action: "start" | "end" | "undo", garage: GarageSession, now = new Date()) {
  assertEventCrew(garage);
  const db = getDb();
  const [performer] = await db.select().from(eventPerformers).where(eq(eventPerformers.id, performerId)).limit(1);
  if (!performer) throw new EventDayError("NOT_FOUND", "Penampil tidak ditemukan.", 404);
  if (performer.status !== "konfirmasi") throw new EventDayError("NOT_CONFIRMED", "Hanya penampil terkonfirmasi yang bisa tampil.", 409);
  if (performer.eventId) await loadEvent(performer.eventId, garage);
  // Satu event = satu panggung: transisi diserialkan per event agar dua HP panitia tidak membuat dua penampil "live".
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`event_stage:${performer.eventId ?? performer.eventName.toLowerCase()}`}))`);
    const [fresh] = await tx.select().from(eventPerformers).where(eq(eventPerformers.id, performerId)).limit(1);
    if (action === "start") {
      const sameEvent = performer.eventId ? eq(eventPerformers.eventId, performer.eventId) : eq(eventPerformers.eventName, performer.eventName);
      await tx
        .update(eventPerformers)
        .set({ actualEnd: now, updatedAt: now })
        .where(and(sameEvent, isNotNull(eventPerformers.actualStart), isNull(eventPerformers.actualEnd), ne(eventPerformers.id, performerId)));
      await tx.update(eventPerformers).set({ actualStart: now, actualEnd: null, updatedAt: now }).where(eq(eventPerformers.id, performerId));
    } else if (action === "end") {
      if (!fresh?.actualStart) throw new EventDayError("NOT_STARTED", "Penampil ini belum mulai.", 409);
      await tx.update(eventPerformers).set({ actualEnd: now, updatedAt: now }).where(eq(eventPerformers.id, performerId));
    } else {
      await tx.update(eventPerformers).set({ actualStart: null, actualEnd: null, updatedAt: now }).where(eq(eventPerformers.id, performerId));
    }
  });
  await audit(garage, action === "start" ? "Penampil mulai tampil" : action === "end" ? "Penampil selesai tampil" : "Batalkan jam tampil nyata", performer.name, {
    performerId,
    eventId: performer.eventId,
    action,
  });
  return { id: performerId, action };
}

// ─── Rundown tunggal → agenda undangan ─────────────────────────────────────

/**
 * Owner: isi agenda undangan/halaman event dari rundown Lineup (penampil terkonfirmasi yang punya jam & durasi).
 * Rundown Lineup = sumber; agenda hanya salinan tampilan.
 */
export async function syncAgendaFromRundown(eventId: string, garage: GarageSession) {
  assertEventCrew(garage);
  if (garage.profile.role !== "Owner") throw new EventDayError("FORBIDDEN", "Hanya Owner yang mengubah agenda event.", 403);
  const event = await loadEvent(eventId, garage);
  const db = getDb();
  const performers = await db.select().from(eventPerformers).where(performerOfEvent(event));
  const rundown = buildRundown(
    performers.map((p) => ({ id: p.id, name: p.name, kind: p.kind as LineupKind, status: p.status as PerformerStatus, slotOrder: p.slotOrder, setStart: p.setStart, setMinutes: p.setMinutes })),
  ).filter((r) => r.status === "konfirmasi" && r.start && r.end);
  if (!rundown.length) throw new EventDayError("RUNDOWN_EMPTY", "Belum ada penampil terkonfirmasi dengan jam & durasi.", 409);
  const agenda = rundown.slice(0, 12).map((r) => ({ start: r.start!, end: r.end!, title: r.name.slice(0, 80) }));
  await db.update(events).set({ agenda, contentVersion: event.contentVersion + 1, updatedBy: garage.user.id, updatedAt: new Date() }).where(eq(events.id, event.id));
  await audit(garage, "Salin rundown ke agenda event", event.title, { eventId: event.id, before: event.agenda, after: agenda });
  return { agenda };
}

// ─── Checklist operasional & keselamatan (GIGS EO #11) ──────────────────────

export const opsCheckPatchSchema = z.object({
  done: z.boolean().optional(),
  pic: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export const opsCheckCreateSchema = z.object({ eventId: z.string().uuid(), label: z.string().trim().min(3).max(160) });

/** Checklist event; item bawaan dibuat otomatis pertama kali dibuka. */
export async function getOpsChecklist(eventId: string, garage: GarageSession) {
  assertEventCrew(garage);
  const event = await loadEvent(eventId, garage);
  const db = getDb();
  let rows = await db.select().from(eventOpsChecks).where(eq(eventOpsChecks.eventId, event.id)).orderBy(asc(eventOpsChecks.sortOrder), asc(eventOpsChecks.createdAt));
  if (!rows.length) {
    await db
      .insert(eventOpsChecks)
      .values(OPS_CHECK_TEMPLATE.map((item, index) => ({ eventId: event.id, key: item.key, label: item.label, sortOrder: index })))
      .onConflictDoNothing();
    rows = await db.select().from(eventOpsChecks).where(eq(eventOpsChecks.eventId, event.id)).orderBy(asc(eventOpsChecks.sortOrder), asc(eventOpsChecks.createdAt));
  }
  const items = rows.map((r) => ({ id: r.id, key: r.key, label: r.label, pic: r.pic, note: r.note, done: Boolean(r.doneAt), doneAt: r.doneAt?.toISOString() ?? null }));
  return { eventId: event.id, items, done: items.filter((i) => i.done).length, total: items.length };
}

export async function updateOpsCheck(id: string, patch: z.infer<typeof opsCheckPatchSchema>, garage: GarageSession) {
  assertEventCrew(garage);
  const db = getDb();
  const [row] = await db.select().from(eventOpsChecks).where(eq(eventOpsChecks.id, id)).limit(1);
  if (!row) throw new EventDayError("NOT_FOUND", "Item checklist tidak ditemukan.", 404);
  await loadEvent(row.eventId, garage);
  const values: Partial<typeof eventOpsChecks.$inferInsert> = {};
  if (patch.done !== undefined) {
    values.doneAt = patch.done ? new Date() : null;
    values.doneBy = patch.done ? garage.user.id : null;
  }
  if (patch.pic !== undefined) values.pic = patch.pic?.trim() || null;
  if (patch.note !== undefined) values.note = patch.note?.trim() || null;
  const [updated] = await db.update(eventOpsChecks).set(values).where(eq(eventOpsChecks.id, id)).returning();
  await audit(garage, patch.done === undefined ? "Ubah checklist operasional event" : patch.done ? "Checklist operasional selesai" : "Checklist operasional dibuka lagi", row.label, {
    eventId: row.eventId,
    checkId: id,
    done: Boolean(updated.doneAt),
  });
  return { id, done: Boolean(updated.doneAt), pic: updated.pic, note: updated.note };
}

export async function addOpsCheck(input: z.infer<typeof opsCheckCreateSchema>, garage: GarageSession) {
  assertEventCrew(garage);
  if (garage.profile.role !== "Owner") throw new EventDayError("FORBIDDEN", "Hanya Owner yang menambah item checklist.", 403);
  const event = await loadEvent(input.eventId, garage);
  const db = getDb();
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(eventOpsChecks).where(eq(eventOpsChecks.eventId, event.id));
  const n = Number(count?.n ?? 0);
  const [row] = await db
    .insert(eventOpsChecks)
    .values({ eventId: event.id, key: `custom-${Date.now().toString(36)}`, label: input.label, sortOrder: n + 1 })
    .returning();
  await audit(garage, "Tambah item checklist operasional event", row.label, { eventId: event.id, checkId: row.id });
  return { id: row.id };
}
