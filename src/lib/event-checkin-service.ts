import { and, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventActivityLogs, eventCheckins, eventGuests, eventInvitations, eventRsvps, events } from "@/db/schema";
import {
  CHECKIN_BLOCK_TEXT,
  CHECKIN_WARNING_TEXT,
  attendanceSummary,
  checkinDecision,
  defaultCheckinPax,
  parseCheckinCode,
  type CheckinBlock,
} from "@/lib/event-checkin-rules";
import { INVITATION_TOKEN_PATTERN, hashInvitationToken } from "@/lib/event-invitation-token";
import { EventError } from "@/lib/event-service";
import { secretsMatch } from "@/lib/secret-compare";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Check-in tamu di pintu (owner 16 Nov 2026). Semua staf yang login langsung
// (Owner/Manajer/Kasir/Waiter) boleh check-in; membatalkan check-in = Owner/Manajer
// dengan alasan. Data tamu yang tampil: nama, batas orang, RSVP — tanpa nomor HP.
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MANAGERS = new Set(["Owner", "Manajer"]);

export const checkinSchema = z
  .object({
    code: z.string().trim().max(400).optional(),
    invitationId: z.string().uuid().optional(),
    pax: z.number().int().min(1).max(50),
    method: z.enum(["scan", "manual"]),
  })
  .refine((v) => Boolean(v.code) || Boolean(v.invitationId), { message: "Kirim QR atau pilih tamu." });

export const walkinSchema = z.object({
  pax: z.number().int().min(1).max(50),
  name: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const undoSchema = z.object({ reason: z.string().trim().min(3, "Alasan wajib diisi.").max(200) });

function actor(garage: GarageSession) {
  return { userId: garage.user.id, name: garage.user.name ?? garage.profile.role };
}

function assertHuman(garage: GarageSession) {
  if (garage.profile.agentKey) throw new EventError(403, "HUMAN_SESSION_REQUIRED", "Check-in hanya untuk staf yang login langsung.");
}

/** Event yang boleh dibuka staf ini: belum diarsipkan & milik outletnya (atau tanpa outlet). */
async function loadEvent(db: Db | Tx, eventId: string, garage: GarageSession) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || (event.outletId && event.outletId !== garage.profile.outlet.id)) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  return event;
}

const wib = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(at);

export async function listCheckinEvents(garage: GarageSession, now = new Date()) {
  assertHuman(garage);
  const rows = await getDb()
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, status: events.status, outletId: events.outletId })
    .from(events)
    .where(and(ne(events.status, "archived"), or(isNull(events.outletId), eq(events.outletId, garage.profile.outlet.id))))
    .orderBy(desc(events.startsAt))
    .limit(30);
  const today = wib(now);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.startsAt.toISOString(),
    status: r.status,
    // Event hari ini (WIB) dipilih otomatis di layar pintu.
    today: wib(r.startsAt) === today || (r.startsAt.getTime() <= now.getTime() && r.endsAt.getTime() >= now.getTime()),
  }));
}

type GuestView = {
  invitationId: string;
  guestName: string;
  maxPax: number;
  rsvp: { response: string; pax: number } | null;
  activeCheckin: { id: string; checkedInAt: string; byName: string | null; pax: number } | null;
};

async function guestViews(db: Db | Tx, invitationIds: string[]): Promise<Map<string, GuestView>> {
  const out = new Map<string, GuestView>();
  if (!invitationIds.length) return out;
  const rows = await db
    .select({ invitation: eventInvitations, guest: eventGuests, rsvp: eventRsvps })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .leftJoin(eventRsvps, eq(eventRsvps.invitationId, eventInvitations.id))
    .where(inArray(eventInvitations.id, invitationIds));
  const active = await db
    .select()
    .from(eventCheckins)
    .where(and(inArray(eventCheckins.invitationId, invitationIds), isNull(eventCheckins.undoneAt)));
  for (const row of rows) {
    const c = active.find((a) => a.invitationId === row.invitation.id);
    out.set(row.invitation.id, {
      invitationId: row.invitation.id,
      guestName: row.guest.fullName,
      maxPax: row.guest.maxPax,
      rsvp: row.rsvp ? { response: row.rsvp.response, pax: row.rsvp.pax } : null,
      activeCheckin: c ? { id: c.id, checkedInAt: c.checkedInAt.toISOString(), byName: c.checkedInByName, pax: c.pax } : null,
    });
  }
  return out;
}

async function invitationByToken(db: Db | Tx, token: string) {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
  const hash = hashInvitationToken(token);
  const [row] = await db
    .select({ invitation: eventInvitations, guest: eventGuests, event: events })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .innerJoin(events, eq(events.id, eventInvitations.eventId))
    .where(eq(eventInvitations.tokenHash, hash))
    .limit(1);
  if (!row || !secretsMatch(row.invitation.tokenHash, hash)) return null;
  return row;
}

async function invitationById(db: Db | Tx, id: string) {
  const [row] = await db
    .select({ invitation: eventInvitations, guest: eventGuests, event: events })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .innerJoin(events, eq(events.id, eventInvitations.eventId))
    .where(eq(eventInvitations.id, id))
    .limit(1);
  return row ?? null;
}

function describe(view: GuestView, row: NonNullable<Awaited<ReturnType<typeof invitationById>>>, eventId: string, pax: number) {
  const decision = checkinDecision(
    {
      invitationStatus: row.invitation.status,
      guestStatus: row.guest.status,
      eventStatus: row.event.status,
      invitationEventId: row.invitation.eventId,
      selectedEventId: eventId,
      maxPax: view.maxPax,
      rsvp: view.rsvp,
      activeCheckin: view.activeCheckin,
    },
    pax,
  );
  return {
    ...view,
    defaultPax: defaultCheckinPax(view.maxPax, view.rsvp),
    allowed: decision.allowed,
    block: decision.block,
    blockText: decision.block ? CHECKIN_BLOCK_TEXT[decision.block] : null,
    warnings: decision.warnings.map((w) => CHECKIN_WARNING_TEXT[w]),
  };
}

/** Pratinjau setelah scan / pilih nama: belum mencatat apa pun. */
export async function previewCheckin(eventId: string, input: { code?: string; invitationId?: string }, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  await loadEvent(db, eventId, garage);
  const row = input.invitationId ? await invitationById(db, input.invitationId) : await invitationByToken(db, parseCheckinCode(input.code) ?? "");
  if (!row) return { found: false as const, blockText: CHECKIN_BLOCK_TEXT.INVALID };
  const view = (await guestViews(db, [row.invitation.id])).get(row.invitation.id)!;
  // Event lain tidak membuka nama tamunya.
  if (row.invitation.eventId !== eventId) {
    // Sebut event yang benar (tanpa nama tamu) supaya petugas bisa memindah pilihan event.
    const sameOutlet = !row.event.outletId || row.event.outletId === garage.profile.outlet.id;
    return {
      found: false as const,
      blockText: sameOutlet && row.event.status !== "archived" ? `Undangan ini untuk event "${row.event.title}". Ganti pilihan event di atas, lalu scan lagi.` : CHECKIN_BLOCK_TEXT.OTHER_EVENT,
      otherEventId: sameOutlet && row.event.status !== "archived" ? row.event.id : null,
    };
  }
  return { found: true as const, guest: describe(view, row, eventId, defaultCheckinPax(view.maxPax, view.rsvp)) };
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "23505" || /duplicate key|unique constraint/i.test(String((current as { message?: unknown }).message ?? ""))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export class CheckinBlockedError extends EventError {
  constructor(
    public block: CheckinBlock,
    message: string,
    public detail: Record<string, unknown> = {},
  ) {
    super(block === "ALREADY_CHECKED_IN" ? 409 : 422, block, message);
  }
}

export async function checkInGuest(eventId: string, input: z.infer<typeof checkinSchema>, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  await loadEvent(db, eventId, garage);
  const who = actor(garage);
  const target = input.invitationId ? await invitationById(db, input.invitationId) : await invitationByToken(db, parseCheckinCode(input.code) ?? "");
  if (!target) throw new CheckinBlockedError("INVALID", CHECKIN_BLOCK_TEXT.INVALID);
  try {
    return await db.transaction(async (tx) => {
      // Kunci undangan: dua petugas memindai QR yang sama bersamaan → hanya satu yang masuk.
      await tx.select({ id: eventInvitations.id }).from(eventInvitations).where(eq(eventInvitations.id, target.invitation.id)).for("update");
      const row = (await invitationById(tx, target.invitation.id))!;
      const view = (await guestViews(tx, [row.invitation.id])).get(row.invitation.id)!;
      const result = describe(view, row, eventId, input.pax);
      if (!result.allowed) {
        const detail = result.block === "ALREADY_CHECKED_IN" && view.activeCheckin ? { checkedInAt: view.activeCheckin.checkedInAt, byName: view.activeCheckin.byName, pax: view.activeCheckin.pax } : {};
        throw new CheckinBlockedError(result.block!, result.block === "PAX_TOO_MANY" ? `${result.blockText} Batas ${view.maxPax} orang.` : result.blockText!, detail);
      }
      const [created] = await tx
        .insert(eventCheckins)
        .values({
          eventId,
          invitationId: row.invitation.id,
          guestId: row.guest.id,
          kind: "invited",
          method: input.method,
          guestName: row.guest.fullName,
          pax: input.pax,
          checkedInBy: who.userId,
          checkedInByName: who.name,
        })
        .returning();
      await tx.insert(eventActivityLogs).values({
        eventId,
        invitationId: row.invitation.id,
        guestId: row.guest.id,
        action: "checked_in",
        actor: who.name,
        metadata: { checkinId: created.id, pax: input.pax, method: input.method, warnings: result.warnings },
      });
      return { checkinId: created.id, guestName: row.guest.fullName, pax: input.pax, warnings: result.warnings, checkedInAt: created.checkedInAt.toISOString() };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CheckinBlockedError("ALREADY_CHECKED_IN", CHECKIN_BLOCK_TEXT.ALREADY_CHECKED_IN);
    throw error;
  }
}

/** Tamu tanpa undangan. Idempoten per kunci (tombol ditekan dua kali tidak menggandakan). */
export async function recordWalkin(eventId: string, input: z.infer<typeof walkinSchema>, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  const event = await loadEvent(db, eventId, garage);
  if (event.status === "archived") throw new EventError(409, "EVENT_ARCHIVED", CHECKIN_BLOCK_TEXT.EVENT_ARCHIVED);
  const who = actor(garage);
  const [replay] = await db.select().from(eventCheckins).where(eq(eventCheckins.clientKey, input.idempotencyKey)).limit(1);
  if (replay) {
    if (replay.eventId !== eventId || replay.pax !== input.pax) throw new EventError(409, "IDEMPOTENCY_MISMATCH", "Permintaan ganda dengan isi berbeda. Muat ulang lalu coba lagi.");
    return { checkinId: replay.id, pax: replay.pax, replay: true };
  }
  const [created] = await db
    .insert(eventCheckins)
    .values({
      eventId,
      kind: "walkin",
      method: "walkin",
      guestName: input.name?.trim() || null,
      pax: input.pax,
      note: input.note?.trim() || null,
      clientKey: input.idempotencyKey,
      checkedInBy: who.userId,
      checkedInByName: who.name,
    })
    .returning();
  await db.insert(eventActivityLogs).values({ eventId, action: "walkin", actor: who.name, metadata: { checkinId: created.id, pax: input.pax, name: created.guestName } });
  return { checkinId: created.id, pax: created.pax, replay: false };
}

export async function undoCheckin(checkinId: string, reason: string, garage: GarageSession) {
  assertHuman(garage);
  if (!MANAGERS.has(garage.profile.role)) throw new EventError(403, "FORBIDDEN", "Membatalkan check-in hanya untuk Owner atau Manajer.");
  const db = getDb();
  const [row] = await db.select().from(eventCheckins).where(eq(eventCheckins.id, checkinId)).limit(1);
  if (!row) throw new EventError(404, "CHECKIN_NOT_FOUND", "Check-in tidak ditemukan.");
  await loadEvent(db, row.eventId, garage);
  if (row.undoneAt) throw new EventError(409, "ALREADY_UNDONE", "Check-in ini sudah dibatalkan.");
  const who = actor(garage);
  await db.update(eventCheckins).set({ undoneAt: new Date(), undoneBy: who.userId, undoReason: reason.trim() }).where(and(eq(eventCheckins.id, checkinId), isNull(eventCheckins.undoneAt)));
  await db.insert(eventActivityLogs).values({
    eventId: row.eventId,
    invitationId: row.invitationId,
    guestId: row.guestId,
    action: "checkin_undone",
    actor: who.name,
    metadata: { checkinId, reason: reason.trim(), pax: row.pax, kind: row.kind },
  });
  return { checkinId, undone: true };
}

/** Cari tamu manual (tanpa QR): nama atau nomor HP. Hanya undangan aktif event ini; nomor HP tidak dikirim. */
export async function searchCheckinGuests(eventId: string, q: string, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  await loadEvent(db, eventId, garage);
  const text = q.trim();
  if (text.length < 2) return [];
  const digits = text.replace(/[^0-9]/g, "");
  const match = digits.length >= 4 ? or(ilike(eventGuests.fullName, `%${text}%`), ilike(eventGuests.phoneNormalized, `%${digits.replace(/^0/, "")}%`)) : ilike(eventGuests.fullName, `%${text}%`);
  const rows = await db
    .select({ invitationId: eventInvitations.id })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .where(and(eq(eventInvitations.eventId, eventId), ne(eventInvitations.status, "revoked"), eq(eventGuests.status, "active"), match))
    .orderBy(eventGuests.fullName)
    .limit(20);
  const views = await guestViews(db, rows.map((r) => r.invitationId));
  return rows.map((r) => {
    const v = views.get(r.invitationId)!;
    return { ...v, defaultPax: defaultCheckinPax(v.maxPax, v.rsvp) };
  });
}

/** Papan pintu: rekap kehadiran + daftar terakhir. */
export async function getCheckinBoard(eventId: string, garage: GarageSession) {
  assertHuman(garage);
  const db = getDb();
  const event = await loadEvent(db, eventId, garage);
  const invited = await db
    .select({ response: eventRsvps.response, pax: eventRsvps.pax })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .leftJoin(eventRsvps, eq(eventRsvps.invitationId, eventInvitations.id))
    .where(and(eq(eventInvitations.eventId, eventId), ne(eventInvitations.status, "revoked"), eq(eventGuests.status, "active")));
  const checkins = await db.select().from(eventCheckins).where(eq(eventCheckins.eventId, eventId)).orderBy(desc(eventCheckins.checkedInAt));
  const attending = invited.filter((r) => r.response === "attending");
  const summary = attendanceSummary({
    invitedGuests: invited.length,
    rsvpAttendingGuests: attending.length,
    rsvpAttendingPax: attending.reduce((sum, r) => sum + (r.pax ?? 0), 0),
    checkins: checkins.map((c) => ({ kind: c.kind, pax: c.pax, undoneAt: c.undoneAt ? c.undoneAt.toISOString() : null })),
  });
  return {
    event: { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), status: event.status },
    summary,
    canUndo: MANAGERS.has(garage.profile.role),
    recent: checkins.slice(0, 60).map((c) => ({
      id: c.id,
      kind: c.kind as "invited" | "walkin",
      method: c.method,
      guestName: c.guestName,
      pax: c.pax,
      checkedInAt: c.checkedInAt.toISOString(),
      byName: c.checkedInByName,
      note: c.note,
      undone: Boolean(c.undoneAt),
      undoReason: c.undoReason,
    })),
  };
}

/** Untuk halaman undangan publik: kapan undangan ini dipakai masuk (tanpa nama petugas). */
export async function invitationCheckinAt(invitationId: string) {
  const [row] = await getDb()
    .select({ at: eventCheckins.checkedInAt })
    .from(eventCheckins)
    .where(and(eq(eventCheckins.invitationId, invitationId), isNull(eventCheckins.undoneAt)))
    .limit(1);
  return row ? row.at.toISOString() : null;
}
