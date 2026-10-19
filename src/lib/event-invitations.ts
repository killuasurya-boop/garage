import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventActivityLogs, eventGuests, eventInvitations, eventRsvps, events } from "@/db/schema";
import { parseImportFile, parseLocaleNumber, type ImportColumn } from "@/lib/bulk-import";
import type { PublicEvent } from "@/lib/event-format";
import {
  INVITATION_TOKEN_PATTERN,
  decryptInvitationToken,
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/event-invitation-token";
import { EventError, toPublicEvent } from "@/lib/event-service";
import { secretsMatch } from "@/lib/secret-compare";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

// =============================================================================
// Tamu, undangan pribadi, RSVP, rekap & ekspor (PRD GC-PRD-EVENT-001 tahap 2).
// WhatsApp dikirim manual (wa.me); status "Dibagikan" = pernyataan petugas,
// bukan bukti terkirim/terbaca.
// =============================================================================

export type InvitationStatus = "ready" | "shared" | "revoked";
export type RsvpResponse = "attending" | "declined";

export type Actor = { userId: string; name: string };

export type GuestRow = {
  id: string;
  fullName: string;
  phone: string | null;
  notes: string | null;
  maxPax: number;
  status: "active" | "archived";
  createdAt: string;
  invitation: { id: string; status: InvitationStatus; tokenRef: string; sharedAt: string | null; createdAt: string } | null;
  rsvp: { response: RsvpResponse; pax: number; note: string | null; respondedAt: string; changeCount: number } | null;
};

export function invitationBaseUrl() {
  const base =
    process.env.GARAGE_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.trim() || "https://garagecoffee.id";
  return base.replace(/\/+$/, "");
}

export function invitationUrl(token: string) {
  return `${invitationBaseUrl()}/undangan/${token}`;
}

async function requireEvent(eventId: string) {
  const [event] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  return event;
}

async function logActivity(
  input: { eventId: string; invitationId?: string | null; guestId?: string | null; action: string; actor: string; metadata?: Record<string, unknown> },
  db: Pick<ReturnType<typeof getDb>, "insert"> = getDb(),
) {
  await db.insert(eventActivityLogs).values({
    eventId: input.eventId,
    invitationId: input.invitationId ?? null,
    guestId: input.guestId ?? null,
    action: input.action,
    actor: input.actor,
    metadata: input.metadata ?? {},
  });
}

// ─── Tamu ───────────────────────────────────────────────────────────────────

export const guestInputSchema = z.object({
  fullName: z.string().trim().min(2, "Nama tamu minimal 2 huruf.").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .refine((value) => !value || Boolean(normalizeWaNumber(value)), "Nomor WhatsApp tidak valid (contoh 0812xxxx)."),
  notes: z.string().trim().max(300).optional().nullable(),
  maxPax: z.number().int().min(1).max(10).optional(),
});
export type GuestInput = z.infer<typeof guestInputSchema>;

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function listGuests(eventId: string, options: { q?: string; status?: "active" | "archived" | "all" } = {}): Promise<GuestRow[]> {
  const db = getDb();
  const statusFilter = options.status ?? "active";
  const guests = await db
    .select()
    .from(eventGuests)
    .where(
      statusFilter === "all"
        ? eq(eventGuests.eventId, eventId)
        : and(eq(eventGuests.eventId, eventId), eq(eventGuests.status, statusFilter)),
    );
  const ids = guests.map((guest) => guest.id);
  const invitations = ids.length
    ? await db
        .select()
        .from(eventInvitations)
        .where(and(inArray(eventInvitations.guestId, ids), ne(eventInvitations.status, "revoked")))
    : [];
  const rsvps = invitations.length
    ? await db.select().from(eventRsvps).where(inArray(eventRsvps.invitationId, invitations.map((inv) => inv.id)))
    : [];
  const invByGuest = new Map(invitations.map((inv) => [inv.guestId, inv]));
  const rsvpByInv = new Map(rsvps.map((rsvp) => [rsvp.invitationId, rsvp]));
  const q = options.q?.trim().toLowerCase() ?? "";
  const qDigits = q.replace(/\D/g, "");

  return guests
    .filter(
      (guest) =>
        !q ||
        guest.fullName.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (guest.phoneNormalized ?? "").includes(qDigits.replace(/^0/, ""))),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"))
    .map((guest) => {
      const inv = invByGuest.get(guest.id);
      const rsvp = inv ? rsvpByInv.get(inv.id) : undefined;
      return {
        id: guest.id,
        fullName: guest.fullName,
        phone: guest.phoneNormalized,
        notes: guest.notes,
        maxPax: guest.maxPax,
        status: guest.status === "archived" ? "archived" : "active",
        createdAt: guest.createdAt.toISOString(),
        invitation: inv
          ? {
              id: inv.id,
              status: inv.status as InvitationStatus,
              tokenRef: inv.tokenRef,
              sharedAt: inv.sharedAt?.toISOString() ?? null,
              createdAt: inv.createdAt.toISOString(),
            }
          : null,
        rsvp: rsvp
          ? {
              response: rsvp.response as RsvpResponse,
              pax: rsvp.pax,
              note: rsvp.note,
              respondedAt: rsvp.updatedAt.toISOString(),
              changeCount: rsvp.changeCount,
            }
          : null,
      };
    });
}

export async function createGuest(eventId: string, input: GuestInput, actor: Actor) {
  const event = await requireEvent(eventId);
  const phone = input.phone ? normalizeWaNumber(input.phone) : null;
  try {
    const [guest] = await getDb()
      .insert(eventGuests)
      .values({
        eventId,
        fullName: input.fullName,
        phone: input.phone || null,
        phoneNormalized: phone || null,
        notes: input.notes || null,
        maxPax: input.maxPax ?? event.defaultMaxPax,
        createdBy: actor.userId,
      })
      .returning();
    await logActivity({ eventId, guestId: guest.id, action: "guest_created", actor: actor.name });
    return guest;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EventError(409, "GUEST_DUPLICATE", "Nomor WhatsApp ini sudah terdaftar sebagai tamu.");
    throw error;
  }
}

export async function updateGuest(
  eventId: string,
  guestId: string,
  input: Partial<GuestInput> & { status?: "active" | "archived" },
  actor: Actor,
) {
  const db = getDb();
  const [current] = await db
    .select()
    .from(eventGuests)
    .where(and(eq(eventGuests.id, guestId), eq(eventGuests.eventId, eventId)))
    .limit(1);
  if (!current) throw new EventError(404, "GUEST_NOT_FOUND", "Tamu tidak ditemukan.");
  const patch: Partial<typeof eventGuests.$inferInsert> = { updatedAt: new Date() };
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.phone !== undefined) {
    patch.phone = input.phone || null;
    patch.phoneNormalized = input.phone ? normalizeWaNumber(input.phone) || null : null;
  }
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.maxPax !== undefined) patch.maxPax = input.maxPax;
  if (input.status !== undefined) patch.status = input.status;
  try {
    const [guest] = await db.update(eventGuests).set(patch).where(eq(eventGuests.id, guestId)).returning();
    // Tamu diarsipkan → undangan aktifnya dicabut supaya link tidak bisa dipakai.
    if (input.status === "archived" && current.status !== "archived") {
      await db
        .update(eventInvitations)
        .set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.userId })
        .where(and(eq(eventInvitations.guestId, guestId), ne(eventInvitations.status, "revoked")));
    }
    await logActivity({
      eventId,
      guestId,
      action: input.status === "archived" ? "guest_archived" : input.status === "active" ? "guest_restored" : "guest_updated",
      actor: actor.name,
    });
    return guest;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EventError(409, "GUEST_DUPLICATE", "Nomor WhatsApp ini sudah dipakai tamu lain.");
    throw error;
  }
}

// ─── Impor CSV/XLSX ─────────────────────────────────────────────────────────

export const GUEST_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Nama", aliases: ["nama tamu", "name", "full name", "nama lengkap"], required: true },
  { key: "phone", label: "WhatsApp", aliases: ["wa", "no wa", "nomor wa", "no hp", "hp", "telepon", "phone", "nomor whatsapp"] },
  { key: "pax", label: "Jumlah orang", aliases: ["pax", "jumlah", "max pax", "orang"] },
  { key: "notes", label: "Catatan", aliases: ["notes", "keterangan", "note"] },
];

export type GuestImportRow = {
  row: number;
  name: string;
  phone: string | null;
  action: "create" | "duplicate" | "error";
  message?: string;
};

export async function importGuests(
  eventId: string,
  buffer: Buffer,
  options: { filename: string; dryRun: boolean },
  actor: Actor,
) {
  const event = await requireEvent(eventId);
  const sheet = await parseImportFile(buffer, options.filename, GUEST_IMPORT_COLUMNS).catch((error: unknown) => {
    throw new EventError(400, "IMPORT_FAILED", error instanceof Error ? error.message : "File impor tidak bisa dibaca.");
  });
  if (sheet.missingRequired.length) {
    throw new EventError(400, "IMPORT_MISSING_COLUMN", `Kolom wajib tidak ada: ${sheet.missingRequired.join(", ")}.`);
  }
  const db = getDb();
  const existing = await db
    .select({ phone: eventGuests.phoneNormalized })
    .from(eventGuests)
    .where(eq(eventGuests.eventId, eventId));
  const knownPhones = new Set(existing.map((row) => row.phone).filter(Boolean) as string[]);
  const seenInFile = new Set<string>();

  const rows: GuestImportRow[] = [];
  const toInsert: Array<typeof eventGuests.$inferInsert> = [];
  for (const { rowNo, values } of sheet.rows) {
    const name = (values.name ?? "").trim();
    const rawPhone = (values.phone ?? "").trim();
    const phone = rawPhone ? normalizeWaNumber(rawPhone) : "";
    const paxRaw = (values.pax ?? "").trim();
    const pax = paxRaw ? parseLocaleNumber(paxRaw) : null;
    const base = { row: rowNo, name: name || "(tanpa nama)", phone: phone || (rawPhone || null) };
    if (name.length < 2) {
      rows.push({ ...base, action: "error", message: "Nama wajib diisi (min 2 huruf)." });
      continue;
    }
    if (rawPhone && !phone) {
      rows.push({ ...base, action: "error", message: "Nomor WhatsApp tidak valid." });
      continue;
    }
    if (pax !== null && (!Number.isInteger(pax) || pax < 1 || pax > 10)) {
      rows.push({ ...base, action: "error", message: "Jumlah orang harus angka 1–10." });
      continue;
    }
    if (phone && knownPhones.has(phone)) {
      rows.push({ ...base, action: "duplicate", message: "Nomor sudah terdaftar sebagai tamu." });
      continue;
    }
    if (phone && seenInFile.has(phone)) {
      rows.push({ ...base, action: "duplicate", message: "Nomor ganda di dalam file." });
      continue;
    }
    if (phone) seenInFile.add(phone);
    rows.push({ ...base, action: "create" });
    toInsert.push({
      eventId,
      fullName: name.slice(0, 120),
      phone: rawPhone || null,
      phoneNormalized: phone || null,
      notes: (values.notes ?? "").trim().slice(0, 300) || null,
      maxPax: pax ?? event.defaultMaxPax,
      createdBy: actor.userId,
    });
  }

  const summary = {
    total: rows.length,
    valid: rows.filter((row) => row.action === "create").length,
    duplicate: rows.filter((row) => row.action === "duplicate").length,
    invalid: rows.filter((row) => row.action === "error").length,
  };

  if (!options.dryRun && toInsert.length) {
    await db.transaction(async (tx) => {
      await tx.insert(eventGuests).values(toInsert);
      await logActivity(
        { eventId, action: "guest_import", actor: actor.name, metadata: { ...summary, filename: options.filename.slice(0, 80) } },
        tx,
      );
    });
  }
  return { dryRun: options.dryRun, committed: !options.dryRun ? summary.valid : 0, summary, ignoredColumns: sheet.ignored, rows };
}

// ─── Undangan ───────────────────────────────────────────────────────────────

/** Buat undangan untuk tamu aktif yang belum punya undangan aktif (guestIds null = semua). */
export async function createInvitations(eventId: string, guestIds: string[] | null, actor: Actor) {
  await requireEvent(eventId);
  const db = getDb();
  return db.transaction(async (tx) => {
    const guests = await tx
      .select({ id: eventGuests.id })
      .from(eventGuests)
      .where(
        and(
          eq(eventGuests.eventId, eventId),
          eq(eventGuests.status, "active"),
          guestIds ? inArray(eventGuests.id, guestIds.length ? guestIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
        ),
      )
      .for("update");
    if (!guests.length) return { created: 0 };
    const active = await tx
      .select({ guestId: eventInvitations.guestId })
      .from(eventInvitations)
      .where(and(inArray(eventInvitations.guestId, guests.map((g) => g.id)), ne(eventInvitations.status, "revoked")));
    const has = new Set(active.map((row) => row.guestId));
    const targets = guests.filter((guest) => !has.has(guest.id));
    if (!targets.length) return { created: 0 };
    const values = targets.map((guest) => {
      const token = generateInvitationToken();
      return {
        eventId,
        guestId: guest.id,
        tokenHash: token.tokenHash,
        tokenEnc: token.tokenEnc,
        tokenRef: token.tokenRef,
        createdBy: actor.userId,
      };
    });
    const inserted = await tx.insert(eventInvitations).values(values).returning({ id: eventInvitations.id, guestId: eventInvitations.guestId });
    await tx.insert(eventActivityLogs).values(
      inserted.map((row) => ({ eventId, invitationId: row.id, guestId: row.guestId, action: "invitation_created", actor: actor.name, metadata: {} })),
    );
    return { created: inserted.length };
  });
}

async function requireInvitation(eventId: string, invitationId: string) {
  const [row] = await getDb()
    .select()
    .from(eventInvitations)
    .where(and(eq(eventInvitations.id, invitationId), eq(eventInvitations.eventId, eventId)))
    .limit(1);
  if (!row) throw new EventError(404, "INVITATION_NOT_FOUND", "Undangan tidak ditemukan.");
  return row;
}

/** Link undangan untuk dibagikan manual (token didekripsi; tidak dicatat di log). */
export async function getInvitationShareInfo(eventId: string, invitationId: string) {
  const invitation = await requireInvitation(eventId, invitationId);
  if (invitation.status === "revoked") throw new EventError(409, "INVITATION_REVOKED", "Undangan sudah dicabut. Buat ulang dulu.");
  const [guest] = await getDb().select().from(eventGuests).where(eq(eventGuests.id, invitation.guestId)).limit(1);
  const [event] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  return {
    url: invitationUrl(decryptInvitationToken(invitation.tokenEnc)),
    guestName: guest?.fullName ?? "",
    guestPhone: guest?.phoneNormalized ?? null,
    event: event ? toPublicEvent(event) : null,
  };
}

export async function markInvitationShared(eventId: string, invitationId: string, actor: Actor) {
  const invitation = await requireInvitation(eventId, invitationId);
  if (invitation.status === "revoked") throw new EventError(409, "INVITATION_REVOKED", "Undangan sudah dicabut.");
  const now = new Date();
  await getDb()
    .update(eventInvitations)
    .set({ status: "shared", sharedAt: now, sharedBy: actor.userId })
    .where(eq(eventInvitations.id, invitationId));
  await logActivity({ eventId, invitationId, guestId: invitation.guestId, action: "invitation_shared", actor: actor.name, metadata: { channel: "whatsapp_manual" } });
  return { sharedAt: now.toISOString() };
}

export async function revokeInvitation(eventId: string, invitationId: string, actor: Actor) {
  const invitation = await requireInvitation(eventId, invitationId);
  if (invitation.status === "revoked") return { revoked: true };
  await getDb()
    .update(eventInvitations)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.userId })
    .where(eq(eventInvitations.id, invitationId));
  await logActivity({ eventId, invitationId, guestId: invitation.guestId, action: "invitation_revoked", actor: actor.name });
  return { revoked: true };
}

/** Cabut undangan lama + buat token baru (mis. link tersebar ke orang lain). RSVP lama ikut pindah. */
export async function reissueInvitation(eventId: string, invitationId: string, actor: Actor) {
  const invitation = await requireInvitation(eventId, invitationId);
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(eventInvitations)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.userId })
      .where(eq(eventInvitations.id, invitationId));
    const token = generateInvitationToken();
    const [next] = await tx
      .insert(eventInvitations)
      .values({ eventId, guestId: invitation.guestId, tokenHash: token.tokenHash, tokenEnc: token.tokenEnc, tokenRef: token.tokenRef, createdBy: actor.userId })
      .returning();
    await tx.update(eventRsvps).set({ invitationId: next.id }).where(eq(eventRsvps.invitationId, invitationId));
    await tx.insert(eventActivityLogs).values({
      eventId,
      invitationId: next.id,
      guestId: invitation.guestId,
      action: "invitation_reissued",
      actor: actor.name,
      metadata: { previousRef: invitation.tokenRef },
    });
    return { invitationId: next.id };
  });
}

// ─── Halaman undangan publik + RSVP ─────────────────────────────────────────

export type PublicInvitation = {
  guestName: string;
  maxPax: number;
  event: PublicEvent;
  rsvp: { response: RsvpResponse; pax: number; note: string | null; respondedAt: string } | null;
  canChange: boolean;
};

async function findInvitationByToken(token: string) {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return null;
  const hash = hashInvitationToken(token);
  const [row] = await getDb()
    .select({ invitation: eventInvitations, guest: eventGuests, event: events })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .innerJoin(events, eq(events.id, eventInvitations.eventId))
    .where(eq(eventInvitations.tokenHash, hash))
    .limit(1);
  // Bandingkan ulang hash secara constant-time (pertahanan tambahan).
  if (!row || !secretsMatch(row.invitation.tokenHash, hash)) return null;
  // Undangan pribadi berlaku selama event belum diarsipkan (Draft maupun Terbit):
  // tamu sering menerima link sebelum landing publik diterbitkan.
  if (row.invitation.status === "revoked" || row.guest.status !== "active" || row.event.status === "archived") return null;
  return row;
}

function rsvpOpen(event: typeof events.$inferSelect, now: Date) {
  const deadline = event.rsvpDeadline ?? event.startsAt;
  return now.getTime() < deadline.getTime();
}

/** Data minimum untuk halaman undangan; null = tautan tidak valid/kedaluwarsa (tanpa detail). */
export async function getPublicInvitation(token: string, now = new Date()): Promise<PublicInvitation | null> {
  const row = await findInvitationByToken(token);
  if (!row) return null;
  const [rsvp] = await getDb().select().from(eventRsvps).where(eq(eventRsvps.invitationId, row.invitation.id)).limit(1);
  return {
    guestName: row.guest.fullName,
    maxPax: row.guest.maxPax,
    event: toPublicEvent(row.event),
    rsvp: rsvp
      ? { response: rsvp.response as RsvpResponse, pax: rsvp.pax, note: rsvp.note, respondedAt: rsvp.updatedAt.toISOString() }
      : null,
    canChange: rsvpOpen(row.event, now),
  };
}

export const rsvpInputSchema = z
  .object({
    response: z.enum(["attending", "declined"]),
    pax: z.number().int().min(0).max(10),
    note: z.string().trim().max(300).optional().nullable(),
  })
  .refine((value) => value.response === "declined" || value.pax >= 1, { message: "Jumlah orang minimal 1.", path: ["pax"] });

export async function submitRsvp(token: string, input: z.infer<typeof rsvpInputSchema>, now = new Date()) {
  const row = await findInvitationByToken(token);
  if (!row) throw new EventError(404, "INVITATION_INVALID", "Tautan undangan tidak valid atau sudah tidak berlaku.");
  if (!rsvpOpen(row.event, now)) {
    throw new EventError(409, "RSVP_CLOSED", "Batas konfirmasi sudah lewat. Hubungi WhatsApp Garage untuk perubahan.");
  }
  const pax = input.response === "declined" ? 0 : input.pax;
  if (pax > row.guest.maxPax) {
    throw new EventError(400, "PAX_TOO_MANY", `Undangan ini berlaku untuk maksimal ${row.guest.maxPax} orang.`);
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    // Kunci baris undangan → submit bersamaan tidak saling menimpa diam-diam.
    await tx.select({ id: eventInvitations.id }).from(eventInvitations).where(eq(eventInvitations.id, row.invitation.id)).for("update");
    const [existing] = await tx.select().from(eventRsvps).where(eq(eventRsvps.invitationId, row.invitation.id)).limit(1);
    let saved;
    if (existing) {
      [saved] = await tx
        .update(eventRsvps)
        .set({ response: input.response, pax, note: input.note || null, source: "guest", changeCount: existing.changeCount + 1, updatedAt: now })
        .where(eq(eventRsvps.id, existing.id))
        .returning();
    } else {
      [saved] = await tx
        .insert(eventRsvps)
        .values({ invitationId: row.invitation.id, response: input.response, pax, note: input.note || null, source: "guest", respondedAt: now, updatedAt: now })
        .returning();
    }
    await tx.insert(eventActivityLogs).values({
      eventId: row.event.id,
      invitationId: row.invitation.id,
      guestId: row.guest.id,
      action: existing ? "rsvp_changed" : "rsvp_submitted",
      actor: "Tamu",
      metadata: { response: input.response, pax, previous: existing ? { response: existing.response, pax: existing.pax } : null },
    });
    return { response: saved.response as RsvpResponse, pax: saved.pax, note: saved.note, respondedAt: saved.updatedAt.toISOString() };
  });
}

// ─── Rekap, ekspor, log ─────────────────────────────────────────────────────

export async function getEventSummary(eventId: string) {
  await requireEvent(eventId);
  const db = getDb();
  const [guestCounts] = await db
    .select({ active: sql<number>`count(*) filter (where ${eventGuests.status} = 'active')::int` })
    .from(eventGuests)
    .where(eq(eventGuests.eventId, eventId));
  const rows = await db
    .select({ status: eventInvitations.status, response: eventRsvps.response, pax: eventRsvps.pax })
    .from(eventInvitations)
    .innerJoin(eventGuests, eq(eventGuests.id, eventInvitations.guestId))
    .leftJoin(eventRsvps, eq(eventRsvps.invitationId, eventInvitations.id))
    .where(and(eq(eventInvitations.eventId, eventId), ne(eventInvitations.status, "revoked"), eq(eventGuests.status, "active")));
  const attending = rows.filter((row) => row.response === "attending");
  return {
    guests: guestCounts?.active ?? 0,
    invitations: rows.length,
    shared: rows.filter((row) => row.status === "shared").length,
    notShared: rows.filter((row) => row.status === "ready").length,
    attending: attending.length,
    attendingPax: attending.reduce((sum, row) => sum + (row.pax ?? 0), 0),
    declined: rows.filter((row) => row.response === "declined").length,
    pending: rows.filter((row) => !row.response).length,
  };
}

/** Sel CSV aman: kutip bila perlu + cegah formula injection (= + - @ tab CR). */
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const RSVP_LABEL: Record<string, string> = { attending: "Hadir", declined: "Tidak hadir" };
const INV_LABEL: Record<string, string> = { ready: "Belum dibagikan", shared: "Dibagikan (manual)" };

export async function exportGuestsCsv(eventId: string) {
  const event = await requireEvent(eventId);
  const guests = await listGuests(eventId, { status: "active" });
  const header = ["Nama", "WhatsApp", "Maks orang", "Status undangan", "Dibagikan pada", "RSVP", "Jumlah hadir", "Catatan tamu", "Waktu RSVP"];
  const fmt = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: event.timezone }).format(new Date(iso)) : "";
  const lines = guests.map((guest) =>
    [
      guest.fullName,
      guest.phone ?? "",
      guest.maxPax,
      guest.invitation ? INV_LABEL[guest.invitation.status] ?? guest.invitation.status : "Belum dibuat",
      fmt(guest.invitation?.sharedAt),
      guest.rsvp ? RSVP_LABEL[guest.rsvp.response] : guest.invitation ? "Belum menjawab" : "",
      guest.rsvp?.response === "attending" ? guest.rsvp.pax : "",
      guest.rsvp?.note ?? "",
      fmt(guest.rsvp?.respondedAt),
    ]
      .map(csvCell)
      .join(","),
  );
  return { filename: `rsvp-${event.slug}.csv`, rows: guests.length, csv: `﻿${[header.join(","), ...lines].join("\r\n")}\r\n` };
}

const ACTION_LABEL: Record<string, string> = {
  guest_created: "Tamu ditambahkan",
  guest_updated: "Data tamu diubah",
  guest_archived: "Tamu diarsipkan",
  guest_restored: "Tamu diaktifkan lagi",
  guest_import: "Impor tamu",
  invitation_created: "Undangan dibuat",
  invitation_shared: "Ditandai dibagikan (WA manual)",
  invitation_revoked: "Undangan dicabut",
  invitation_reissued: "Link undangan dibuat ulang",
  rsvp_submitted: "RSVP dikirim tamu",
  rsvp_changed: "RSVP diubah tamu",
};

export async function listEventActivity(eventId: string, limit = 200) {
  const rows = await getDb()
    .select({ log: eventActivityLogs, guestName: eventGuests.fullName })
    .from(eventActivityLogs)
    .leftJoin(eventGuests, eq(eventGuests.id, eventActivityLogs.guestId))
    .where(eq(eventActivityLogs.eventId, eventId))
    .orderBy(desc(eventActivityLogs.occurredAt))
    .limit(Math.min(500, Math.max(1, limit)));
  return rows.map(({ log, guestName }) => ({
    id: log.id,
    action: log.action,
    label: ACTION_LABEL[log.action] ?? log.action,
    actor: log.actor,
    guestName,
    metadata: log.metadata,
    occurredAt: log.occurredAt.toISOString(),
  }));
}

// Dipakai tes & rekap: undangan aktif per tamu.
export async function activeInvitationForGuest(guestId: string) {
  const [row] = await getDb()
    .select()
    .from(eventInvitations)
    .where(and(eq(eventInvitations.guestId, guestId), ne(eventInvitations.status, "revoked"), isNull(eventInvitations.revokedAt)))
    .limit(1);
  return row ?? null;
}
