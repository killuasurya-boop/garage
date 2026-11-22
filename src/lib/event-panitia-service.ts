import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventBudgetLines, eventCrew, eventCrewTasks, eventExpensePayments, eventPerformers, events } from "@/db/schema";
import { panitiaExtras } from "@/lib/event-crew-notes-service";
import { EVENT_COST_LABEL, type EventCostCategory } from "@/lib/event-finance-rules";
import { LineupError } from "@/lib/event-lineup-service";
import {
  buildRundown,
  CREW_ROLE_LABEL,
  isTaskOverdue,
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
// Ruang Panitia `/panitia` (Owner 17 Nov 2026): anggota panitia yang DITAUTKAN Owner ke akun login stafnya
// (`event_crew.user_id`) melihat event tempat ia menjadi panitia aktif saja. Hak per jabatan, dicek di server:
// - semua panitia: rundown (tanpa kontak), daftar tugas, ubah STATUS tugas miliknya sendiri;
// - Ketua & Sekretaris: buat tugas + ubah status semua tugas event itu;
// - Ketua & Bendahara: ringkasan anggaran vs dibayar (baca saja, tanpa nama penerima/kontak).
// Tidak ada uang yang bisa dicatat di sini, tidak ada kontak sponsor/talent. Setiap perubahan → audit (via=panitia).
// =============================================================================

const TASK_MANAGERS: CrewRole[] = ["ketua", "sekretaris"];
const FINANCE_VIEWERS: CrewRole[] = ["ketua", "bendahara"];

function assertHuman(garage: GarageSession) {
  if (garage.profile.agentKey) throw new LineupError("HUMAN_SESSION_REQUIRED", "Ruang panitia hanya untuk akun yang login langsung.", 403);
}

type CrewRow = typeof eventCrew.$inferSelect;
const eventKey = (row: { eventId: string | null; eventName: string }) => (row.eventId ? `id:${row.eventId}` : `name:${row.eventName}`);

async function myCrew(garage: GarageSession): Promise<CrewRow[]> {
  return getDb()
    .select()
    .from(eventCrew)
    .where(and(eq(eventCrew.userId, garage.user.id), eq(eventCrew.status, "aktif")))
    .orderBy(asc(eventCrew.createdAt));
}

/** Baris yang sama event-nya dengan keanggotaan panitia (ID master; nama hanya untuk data lama tanpa master). */
function sameEventAs(table: typeof eventPerformers | typeof eventCrew | typeof eventCrewTasks, crew: CrewRow) {
  return crew.eventId ? eq(table.eventId, crew.eventId) : and(isNull(table.eventId), eq(table.eventName, crew.eventName));
}

export type PanitiaWorkspace = Awaited<ReturnType<typeof getPanitiaWorkspace>>;

export async function getPanitiaWorkspace(garage: GarageSession, now = new Date()) {
  assertHuman(garage);
  const db = getDb();
  const today = wibDate(now);
  const memberships = await myCrew(garage);
  const groups = new Map<string, CrewRow[]>();
  for (const m of memberships) groups.set(eventKey(m), [...(groups.get(eventKey(m)) ?? []), m]);

  const out = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const roles = [...new Set(rows.map((r) => r.role as CrewRole))];
    const myCrewIds = rows.map((r) => r.id);
    const canManageTasks = roles.some((r) => TASK_MANAGERS.includes(r));
    const canSeeFinance = roles.some((r) => FINANCE_VIEWERS.includes(r));
    const [master] = first.eventId
      ? await db.select({ id: events.id, title: events.title, startsAt: events.startsAt, venueName: events.venueName }).from(events).where(eq(events.id, first.eventId)).limit(1)
      : [];

    const performers = await db
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
      .where(and(sameEventAs(eventPerformers, first), eq(eventPerformers.status, "konfirmasi")));
    const rundown = buildRundown(performers.map((p) => ({ ...p, kind: p.kind as LineupKind, status: p.status as PerformerStatus }))).map((r) => ({
      slot: r.slot,
      name: r.name,
      kind: r.kind,
      start: r.start,
      end: r.end,
      overlap: r.overlap,
    }));

    const crewNames = new Map(
      (await db.select({ id: eventCrew.id, name: eventCrew.name, role: eventCrew.role }).from(eventCrew).where(and(sameEventAs(eventCrew, first), eq(eventCrew.status, "aktif")))).map((c) => [
        c.id,
        { name: c.name, role: c.role as CrewRole },
      ]),
    );
    const taskRows = await db
      .select()
      .from(eventCrewTasks)
      .where(sameEventAs(eventCrewTasks, first))
      .orderBy(sql`${eventCrewTasks.dueDate} asc nulls last`, asc(eventCrewTasks.createdAt));
    const tasks = taskRows.map((t) => {
      const mine = Boolean(t.crewId && myCrewIds.includes(t.crewId));
      return {
        id: t.id,
        title: t.title,
        status: t.status as TaskStatus,
        priority: t.priority,
        dueDate: t.dueDate ? String(t.dueDate) : null,
        crewName: t.crewId ? crewNames.get(t.crewId)?.name ?? null : null,
        mine,
        overdue: isTaskOverdue({ status: t.status as TaskStatus, dueDate: t.dueDate ? String(t.dueDate) : null }, today),
        canUpdate: canManageTasks || mine,
      };
    });

    let finance: null | {
      planned: number;
      paid: number;
      categories: Array<{ category: EventCostCategory; label: string; planned: number; paid: number }>;
    } = null;
    if (canSeeFinance && first.eventId) {
      const lines = await db
        .select({ id: eventBudgetLines.id, category: eventBudgetLines.category, planned: eventBudgetLines.plannedAmount })
        .from(eventBudgetLines)
        .where(and(eq(eventBudgetLines.eventId, first.eventId), eq(eventBudgetLines.status, "aktif")));
      const paidRows = lines.length
        ? await db
            .select({ lineId: eventExpensePayments.budgetLineId, amount: sql<number>`sum(${eventExpensePayments.amount})::int` })
            .from(eventExpensePayments)
            .where(and(inArray(eventExpensePayments.budgetLineId, lines.map((l) => l.id)), eq(eventExpensePayments.status, "posted")))
            .groupBy(eventExpensePayments.budgetLineId)
        : [];
      const paidBy = new Map(paidRows.map((p) => [p.lineId, Number(p.amount)]));
      const byCat = new Map<EventCostCategory, { planned: number; paid: number }>();
      for (const l of lines) {
        const cat = l.category as EventCostCategory;
        const cur = byCat.get(cat) ?? { planned: 0, paid: 0 };
        byCat.set(cat, { planned: cur.planned + l.planned, paid: cur.paid + (paidBy.get(l.id) ?? 0) });
      }
      const categories = [...byCat.entries()].map(([category, v]) => ({ category, label: EVENT_COST_LABEL[category] ?? category, ...v }));
      finance = {
        planned: categories.reduce((s, c) => s + c.planned, 0),
        paid: categories.reduce((s, c) => s + c.paid, 0),
        categories: categories.sort((a, b) => b.planned - a.planned),
      };
    }

    out.push({
      key: eventKey(first),
      eventId: first.eventId,
      title: master?.title ?? first.eventName,
      startsAt: master?.startsAt ? master.startsAt.toISOString() : null,
      venue: master?.venueName ?? null,
      roles: roles.map((r) => ({ role: r, label: CREW_ROLE_LABEL[r] ?? r })),
      canManageTasks,
      canSeeFinance,
      rundown,
      tasks,
      assignees: canManageTasks ? [...crewNames.entries()].map(([id, c]) => ({ id, name: c.name, role: CREW_ROLE_LABEL[c.role] ?? c.role })) : [],
      finance,
      ...(await panitiaExtras(first.eventId, roles)),
    });
  }
  return { today, name: garage.user.name ?? "Panitia", events: out };
}

async function audit(garage: GarageSession, action: string, object: string, metadata: Record<string, unknown>) {
  await createAuditLog({
    actor: `${garage.user.name ?? "Panitia"} (panitia)`,
    action,
    object,
    device: garage.profile.deviceLabel ?? "Ruang Panitia",
    metadata: { module: "event-lineup", via: "panitia", userId: garage.user.id, ...metadata },
  });
}

export const panitiaTaskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });

/** Ubah status tugas: milik sendiri (semua panitia) atau semua tugas event (Ketua/Sekretaris). */
export async function panitiaUpdateTaskStatus(taskId: string, input: z.infer<typeof panitiaTaskStatusSchema>, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  const [task] = await db.select().from(eventCrewTasks).where(eq(eventCrewTasks.id, taskId)).limit(1);
  if (!task) throw new LineupError("NOT_FOUND", "Tugas tidak ditemukan.", 404);
  const memberships = (await myCrew(garage)).filter((m) => (m.eventId ? m.eventId === task.eventId : !task.eventId && m.eventName === task.eventName));
  if (!memberships.length) throw new LineupError("FORBIDDEN", "Anda bukan panitia event ini.", 403);
  const isManager = memberships.some((m) => TASK_MANAGERS.includes(m.role as CrewRole));
  const isMine = Boolean(task.crewId && memberships.some((m) => m.id === task.crewId));
  if (!isManager && !isMine) throw new LineupError("FORBIDDEN", "Hanya tugas Anda sendiri yang bisa diubah. Minta Ketua/Sekretaris untuk tugas lain.", 403);
  if (task.status === input.status) return task;
  const [row] = await db
    .update(eventCrewTasks)
    .set({ status: input.status, doneAt: input.status === "selesai" ? task.doneAt ?? new Date() : null, updatedAt: new Date() })
    .where(eq(eventCrewTasks.id, taskId))
    .returning();
  await audit(garage, `Tugas panitia → ${input.status}`, row.title, { eventName: row.eventName, taskId, before: { status: task.status }, after: { status: row.status } });
  return row;
}

export const panitiaTaskInputSchema = z.object({
  eventKey: z.string().min(4).max(200),
  title: z.string().trim().min(3, "Judul tugas wajib diisi.").max(160),
  crewId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.").nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

/** Buat tugas (Ketua/Sekretaris event itu saja). Penanggung jawab harus panitia aktif event yang sama. */
export async function panitiaCreateTask(input: z.infer<typeof panitiaTaskInputSchema>, garage: GarageSession) {
  assertHuman(garage);
  const memberships = (await myCrew(garage)).filter((m) => eventKey(m) === input.eventKey);
  if (!memberships.length) throw new LineupError("FORBIDDEN", "Anda bukan panitia event ini.", 403);
  if (!memberships.some((m) => TASK_MANAGERS.includes(m.role as CrewRole))) {
    throw new LineupError("FORBIDDEN", "Hanya Ketua atau Sekretaris yang bisa membuat tugas.", 403);
  }
  const ref = memberships[0];
  const db = getDb();
  if (input.crewId) {
    const [pic] = await db
      .select({ id: eventCrew.id })
      .from(eventCrew)
      .where(and(eq(eventCrew.id, input.crewId), eq(eventCrew.status, "aktif"), sameEventAs(eventCrew, ref)))
      .limit(1);
    if (!pic) throw new LineupError("CREW_OTHER_EVENT", "Penanggung jawab harus panitia aktif di event yang sama.", 400);
  }
  const [row] = await db
    .insert(eventCrewTasks)
    .values({
      eventId: ref.eventId,
      eventName: ref.eventName,
      title: input.title,
      crewId: input.crewId ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? "normal",
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah tugas panitia", row.title, { eventName: row.eventName, taskId: row.id, crewId: row.crewId });
  return row;
}

/** Ada keanggotaan panitia aktif untuk akun ini? (menu "Ruang Panitia" hanya tampil bila ya). */
export async function hasPanitiaAccess(garage: GarageSession) {
  if (garage.profile.agentKey) return false;
  const [row] = await getDb()
    .select({ id: eventCrew.id })
    .from(eventCrew)
    .where(and(eq(eventCrew.userId, garage.user.id), eq(eventCrew.status, "aktif")))
    .limit(1);
  return Boolean(row);
}
