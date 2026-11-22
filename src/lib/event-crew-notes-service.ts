// Catatan panitia + rekap konsumsi per event (Owner 22 Nov 2026, pindahan Dashboard Penyelenggara platform).
// - Baca: Owner & Manajer (papan Lineup), panitia aktif event itu (Ruang Panitia; rekap konsumsi hanya Ketua,
//   Sekretaris, Bendahara, seksi Konsumsi).
// - Ubah catatan: Owner, atau Ketua/Sekretaris panitia event itu. Kunci `revision`: simpan dari 2 layar → 409, tidak menimpa.
// Hanya event master (event_id). Tidak ada uang, kontak, atau nomor HP di sini. Setiap simpan → audit (setelah tulis).

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventBudgetLines, eventCrew, eventCrewNotes, eventPerformers, eventRegistrations, events } from "@/db/schema";
import { buildConsumption } from "@/lib/event-consumption-rules";
import { LineupError } from "@/lib/event-lineup-service";
import { CREW_ROLE_LABEL, type CrewRole } from "@/lib/event-lineup-rules";
import { createAuditLog } from "@/lib/garage-service";
import { LINEUP_KIND_LABEL, type LineupKind } from "@/lib/gigs-lineup";
import type { GarageSession } from "@/lib/server-auth";

export const NOTE_EDITORS: CrewRole[] = ["ketua", "sekretaris"];
export const CONSUMPTION_VIEWERS: CrewRole[] = ["ketua", "sekretaris", "bendahara", "konsumsi"];

export type EventNotes = { rundown: string; readiness: string; extraPortions: number; revision: number; updatedByName: string | null; updatedAt: string | null };

const EMPTY_NOTES: EventNotes = { rundown: "", readiness: "", extraPortions: 0, revision: 0, updatedByName: null, updatedAt: null };

export async function loadEventNotes(eventId: string): Promise<EventNotes> {
  const [row] = await getDb().select().from(eventCrewNotes).where(eq(eventCrewNotes.eventId, eventId)).limit(1);
  if (!row) return EMPTY_NOTES;
  return {
    rundown: row.rundown,
    readiness: row.readiness,
    extraPortions: row.extraPortions,
    revision: row.revision,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rekap konsumsi event master: panitia aktif + talent terkonfirmasi (+ isian pendaftaran tertaut) + porsi tambahan. */
export async function loadConsumption(eventId: string, extraPortions: number) {
  const db = getDb();
  const [crew, performers, regs, honorLines] = await Promise.all([
    db.select({ id: eventCrew.id, name: eventCrew.name, role: eventCrew.role }).from(eventCrew).where(and(eq(eventCrew.eventId, eventId), eq(eventCrew.status, "aktif"))),
    db
      .select({ id: eventPerformers.id, name: eventPerformers.name, kind: eventPerformers.kind, memberCount: eventPerformers.memberCount, slotOrder: eventPerformers.slotOrder })
      .from(eventPerformers)
      .where(and(eq(eventPerformers.eventId, eventId), eq(eventPerformers.status, "konfirmasi"))),
    db
      .select({
        type: eventRegistrations.type,
        status: eventRegistrations.status,
        members: eventRegistrations.members,
        attendance: eventRegistrations.attendance,
        diet: eventRegistrations.diet,
        crewId: eventRegistrations.linkedCrewId,
        performerId: eventRegistrations.linkedPerformerId,
      })
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.eventId, eventId), inArray(eventRegistrations.type, ["crew", "creator"]))),
    db
      .select({ performerId: eventBudgetLines.performerId })
      .from(eventBudgetLines)
      .where(and(eq(eventBudgetLines.eventId, eventId), eq(eventBudgetLines.status, "aktif"))),
  ]);
  const byCrew = new Map(regs.filter((r) => r.crewId).map((r) => [r.crewId as string, r]));
  const byPerformer = new Map(regs.filter((r) => r.performerId).map((r) => [r.performerId as string, r]));
  const funded = new Set(honorLines.map((l) => l.performerId).filter(Boolean));
  return buildConsumption({
    crew: crew
      .sort((a, b) => a.name.localeCompare(b.name, "id"))
      .map((c) => {
        const reg = byCrew.get(c.id);
        return { name: c.name, role: CREW_ROLE_LABEL[c.role as CrewRole] ?? c.role, members: reg?.members ?? 1, attendance: reg?.attendance ?? null, diet: reg?.diet ?? null };
      }),
    talents: performers
      .sort((a, b) => (a.slotOrder ?? 0) - (b.slotOrder ?? 0))
      .map((p) => {
        const reg = byPerformer.get(p.id);
        return { name: p.name, kind: LINEUP_KIND_LABEL[p.kind as LineupKind] ?? p.kind, members: p.memberCount ?? reg?.members ?? 1, diet: reg?.diet ?? null, funded: funded.has(p.id) };
      }),
    extraPortions,
    crewWaiting: regs.filter((r) => r.type === "crew" && (r.status === "diajukan" || r.status === "revisi")).length,
  });
}

/** Owner & Manajer (papan Lineup): catatan + rekap konsumsi event master. */
export async function getEventExtrasForStaff(garage: GarageSession, eventId: string) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") throw new LineupError("FORBIDDEN", "Hanya untuk Owner dan Manajer.", 403);
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Hanya untuk staf yang login langsung.", 403);
  const [event] = await getDb().select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new LineupError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const notes = await loadEventNotes(eventId);
  return { notes, consumption: await loadConsumption(eventId, notes.extraPortions), canEditNotes: garage.profile.role === "Owner" };
}

export const eventNotesSchema = z.object({
  eventId: z.string().uuid(),
  rundown: z.string().max(4000, "Catatan rundown maksimal 4.000 karakter."),
  readiness: z.string().max(4000, "Catatan kesiapan maksimal 4.000 karakter."),
  extraPortions: z.number().int().min(0).max(1000, "Porsi tambahan maksimal 1.000."),
  revision: z.number().int().min(0),
});

async function crewRolesFor(garage: GarageSession, eventId: string): Promise<CrewRole[]> {
  const rows = await getDb()
    .select({ role: eventCrew.role })
    .from(eventCrew)
    .where(and(eq(eventCrew.userId, garage.user.id), eq(eventCrew.eventId, eventId), eq(eventCrew.status, "aktif")));
  return rows.map((r) => r.role as CrewRole);
}

/** Simpan catatan (Owner, atau Ketua/Sekretaris panitia event itu). Revisi lama → 409 NOTES_CONFLICT. */
export async function saveEventNotes(input: z.infer<typeof eventNotesSchema>, garage: GarageSession) {
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Catatan panitia hanya untuk akun yang login langsung.", 403);
  const db = getDb();
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, input.eventId)).limit(1);
  if (!event) throw new LineupError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  const isOwner = garage.profile.role === "Owner";
  if (!isOwner) {
    const roles = await crewRolesFor(garage, event.id);
    if (!roles.length) throw new LineupError("FORBIDDEN", "Anda bukan panitia event ini.", 403);
    if (!roles.some((r) => NOTE_EDITORS.includes(r))) throw new LineupError("FORBIDDEN", "Hanya Ketua atau Sekretaris yang bisa mengubah catatan.", 403);
  }
  const before = await loadEventNotes(event.id);
  const values = {
    rundown: input.rundown.trim(),
    readiness: input.readiness.trim(),
    extraPortions: input.extraPortions,
    updatedBy: garage.user.id,
    updatedByName: garage.user.name ?? (isOwner ? "Owner" : "Panitia"),
    updatedAt: new Date(),
  };
  const conflict = () => new LineupError("NOTES_CONFLICT", "Catatan baru saja diubah orang lain. Muat ulang, lalu simpan lagi.", 409);
  let saved;
  if (input.revision === 0) {
    [saved] = await db.insert(eventCrewNotes).values({ eventId: event.id, ...values, revision: 1 }).onConflictDoNothing().returning();
  } else {
    [saved] = await db
      .update(eventCrewNotes)
      .set({ ...values, revision: input.revision + 1 })
      .where(and(eq(eventCrewNotes.eventId, event.id), eq(eventCrewNotes.revision, input.revision)))
      .returning();
  }
  if (!saved) throw conflict();
  await createAuditLog({
    actor: isOwner ? (garage.user.name ?? "Owner") : `${garage.user.name ?? "Panitia"} (panitia)`,
    action: "Ubah catatan panitia",
    object: event.title,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: {
      module: "event-lineup",
      via: isOwner ? "lineup" : "panitia",
      eventId: event.id,
      before: { rundownLength: before.rundown.length, readinessLength: before.readiness.length, extraPortions: before.extraPortions },
      after: { rundownLength: saved.rundown.length, readinessLength: saved.readiness.length, extraPortions: saved.extraPortions },
    },
  });
  return loadEventNotes(event.id);
}

/** Bagian Ruang Panitia: catatan (semua panitia) + rekap konsumsi (Ketua/Sekretaris/Bendahara/Konsumsi). */
export async function panitiaExtras(eventId: string | null, roles: CrewRole[]) {
  if (!eventId) return { notes: null, consumption: null, canEditNotes: false };
  const notes = await loadEventNotes(eventId);
  const canSeeConsumption = roles.some((r) => CONSUMPTION_VIEWERS.includes(r));
  return {
    notes,
    consumption: canSeeConsumption ? await loadConsumption(eventId, notes.extraPortions) : null,
    canEditNotes: roles.some((r) => NOTE_EDITORS.includes(r)),
  };
}
