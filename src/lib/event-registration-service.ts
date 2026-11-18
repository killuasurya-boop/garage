// Pendaftaran GIGS di Garage OS (Owner 18 Nov 2026, satu pintu). Form halaman event platform (/event/<slug>/daftar,
// daftar.js) memanggil /event/<slug>/api/public/register|registration/* → Caddy → route Garage → service ini.
// Publik: daftar, cek (ID + kode), ubah (kembali "diajukan"), setlist. Owner: tinjau → setujui (penampil/sponsor/panitia
// dibuat & ditautkan, langsung tampil), minta revisi, tolak. Panitia ketua/sekretaris: lihat saja (tanpa kontak/nominal).
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { eventCrew, eventPerformers, eventRegistrations, events, eventSponsors, staffProfiles } from "@/db/schema";
import { findEventForPlatform } from "@/lib/event-master";
import {
  cleanRegistration,
  creatorKind,
  crewRoleFor,
  firstIssue,
  newRegistrationCode,
  registrationCodeHash,
  registrationCodeMatches,
  registrationEntry,
  registrationSchema,
  setlistSchema,
  type RegistrationRowLike,
} from "@/lib/event-registration-rules";
import { createAuditLog } from "@/lib/garage-service";
import { lineupKey } from "@/lib/gigs-lineup";
import { fetchPlatformLineup } from "@/lib/gigs-promo";
import { MenuImageUploadError, storeMenuImageBuffer } from "@/lib/menu-image-upload";
import type { GarageSession } from "@/lib/server-auth";

export class RegistrationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

type Row = typeof eventRegistrations.$inferSelect;
type MasterRef = { id: string; title: string };

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new RegistrationError("NOT_CONFIGURED", "Layanan pendaftaran belum tersedia.", 503);
  return value;
}

/** Event platform (slug) → master event Garage OS. Tanpa master → null (route meneruskan ke platform). */
export async function resolveRegistrationEvent(slug: string): Promise<MasterRef | null> {
  const platform = await fetchPlatformLineup({ slug, name: "" }).catch(() => null);
  return findEventForPlatform({ slug, name: platform?.name ?? "" });
}

async function storeLogo(base64: string | undefined, type: string, id: string): Promise<string | null> {
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new RegistrationError("LOGO_INVALID", "Logo harus PNG, JPG, atau WebP, maksimal 2 MB.");
  try {
    return await storeMenuImageBuffer(buffer, type === "sponsor" ? "event-sponsor" : "event-lineup", `reg-${id}`);
  } catch (error) {
    if (error instanceof MenuImageUploadError) throw new RegistrationError("LOGO_INVALID", "Logo tidak bisa dibaca. Pakai PNG, JPG, atau WebP.");
    throw error;
  }
}

function parseInput(raw: unknown) {
  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) throw new RegistrationError("INVALID", firstIssue(parsed.error));
  try {
    return cleanRegistration(parsed.data);
  } catch (error) {
    throw new RegistrationError("INVALID", error instanceof Error ? error.message : "Isian tidak valid.");
  }
}

function fieldsOf(input: ReturnType<typeof cleanRegistration>) {
  return {
    name: input.name,
    pic: input.pic,
    whatsapp: input.whatsapp,
    instagram: input.instagram,
    description: input.description || null,
    consent: input.consent,
    category: input.type === "crew" ? null : input.category,
    address: input.type === "sponsor" ? input.address || null : null,
    amount: input.type === "sponsor" ? input.amount : null,
    members: input.type === "sponsor" ? null : (input.members ?? null),
    role: input.type === "crew" ? input.role : null,
    attendance: input.type === "crew" ? input.attendance : null,
    portfolio: input.type === "creator" ? input.portfolio || null : null,
    tech: input.type === "creator" ? input.tech || null : null,
    diet: input.type === "sponsor" ? null : input.diet || null,
  };
}

async function entryOf(row: Row) {
  const db = getDb();
  let published = false;
  let slot: { name: string; startTime: string; durationMin: number } | null = null;
  if (row.linkedPerformerId) {
    const [p] = await db.select().from(eventPerformers).where(eq(eventPerformers.id, row.linkedPerformerId)).limit(1);
    if (p) {
      published = p.status === "konfirmasi" && p.showOnWebsite;
      if (p.setStart || p.slotOrder) {
        slot = { name: p.slotOrder ? `Urutan ${p.slotOrder}` : "Panggung utama", startTime: p.setStart ?? "", durationMin: p.setMinutes ?? 0 };
      }
    }
  }
  if (row.linkedSponsorId) {
    const [s] = await db.select({ show: eventSponsors.showOnWebsite, status: eventSponsors.status }).from(eventSponsors).where(eq(eventSponsors.id, row.linkedSponsorId)).limit(1);
    published = Boolean(s?.show && s.status !== "batal");
  }
  return registrationEntry(row as RegistrationRowLike, { published, slot });
}

async function loadForCode(event: MasterRef, id: string, code: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb().select().from(eventRegistrations).where(eq(eventRegistrations.id, id)).limit(1);
  if (!row || row.eventId !== event.id) return null;
  if (!registrationCodeMatches(secret(), row.id, code, row.codeHash)) throw new RegistrationError("WRONG_CODE", "ID atau kode edit tidak cocok.", 403);
  return row;
}

async function notifyOwners(event: MasterRef, row: Row, isUpdate: boolean) {
  const owners = await getDb()
    .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
  const { notifyStaff } = await import("@/lib/staff-notifications");
  const label = row.type === "creator" ? "kreator" : row.type === "sponsor" ? "sponsor" : "kru";
  for (const owner of owners) {
    await notifyStaff({
      outletId: owner.outletId,
      audience: "user",
      userId: owner.userId,
      kind: "gigs_registration",
      severity: "info",
      title: isUpdate ? `Pendaftar ${label} mengubah data` : `Pendaftar ${label} baru`,
      body: `${row.name} · ${event.title}. Tinjau di Pendaftar.`,
      url: `/control/registrations?eventId=${event.id}`,
      dedupKey: `gigs-registration:${row.id}:${row.updatedAt.getTime()}:${owner.userId}`,
    }).catch(() => null);
  }
}

// ─── Publik (form halaman event) ────────────────────────────────────────────

export async function registerPublic(event: MasterRef, raw: unknown) {
  const input = parseInput(raw);
  const id = crypto.randomUUID();
  const code = newRegistrationCode();
  const logoUrl = await storeLogo(input.logo, input.type, id);
  const [row] = await getDb()
    .insert(eventRegistrations)
    .values({ id, eventId: event.id, eventName: event.title, type: input.type, status: "diajukan", codeHash: registrationCodeHash(secret(), id, code), logoUrl, ...fieldsOf(input) })
    .returning();
  await notifyOwners(event, row, false);
  return { id, code, entry: await entryOf(row) };
}

export async function lookupRegistration(event: MasterRef, id: string, code: string) {
  const row = await loadForCode(event, id, code);
  return row ? entryOf(row) : null;
}

/** Ubah isian: kembali "diajukan" (ditinjau ulang). Data penampil/sponsor yang sudah tayang tidak berubah sampai disetujui lagi. */
export async function updateRegistration(event: MasterRef, id: string, code: string, raw: unknown) {
  const row = await loadForCode(event, id, code);
  if (!row) return null;
  if (row.status === "ditolak") throw new RegistrationError("REJECTED", "Pendaftaran ini sudah ditolak panitia dan tidak bisa diubah.", 409);
  const input = parseInput(raw);
  if (input.type !== row.type) throw new RegistrationError("TYPE_LOCKED", "Jenis pendaftaran tidak bisa diganti. Daftar baru untuk jenis lain.");
  const logoUrl = (await storeLogo(input.logo, input.type, id)) ?? row.logoUrl;
  const [updated] = await getDb()
    .update(eventRegistrations)
    .set({ ...fieldsOf(input), logoUrl, status: "diajukan", updatedAt: new Date() })
    .where(eq(eventRegistrations.id, id))
    .returning();
  await notifyOwners(event, updated, true);
  return entryOf(updated);
}

export async function saveRegistrationSetlist(event: MasterRef, id: string, code: string, raw: unknown) {
  const row = await loadForCode(event, id, code);
  if (!row) return null;
  if (row.type !== "creator" || row.status === "ditolak") throw new RegistrationError("NOT_CREATOR", "Setlist hanya untuk kreator yang tidak ditolak.", 409);
  const parsed = setlistSchema.safeParse(raw);
  if (!parsed.success) throw new RegistrationError("INVALID", firstIssue(parsed.error));
  await getDb().update(eventRegistrations).set({ setlist: parsed.data, updatedAt: new Date() }).where(eq(eventRegistrations.id, id));
  return { setlist: parsed.data };
}

// ─── Owner: tinjau ──────────────────────────────────────────────────────────

function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new RegistrationError("FORBIDDEN", "Tinjauan pendaftar hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new RegistrationError("HUMAN_SESSION_REQUIRED", "Tinjauan pendaftar hanya untuk Owner yang login langsung.", 403);
}

export async function listRegistrations(eventId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const rows = await getDb().select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId)).orderBy(desc(eventRegistrations.createdAt));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    name: r.name,
    pic: r.pic,
    whatsapp: r.whatsapp,
    instagram: r.instagram,
    description: r.description,
    category: r.category,
    address: r.address,
    amount: r.amount,
    members: r.members,
    role: r.role,
    attendance: r.attendance,
    portfolio: r.portfolio,
    tech: r.tech,
    diet: r.diet,
    logoUrl: r.logoUrl,
    setlist: r.setlist,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    linked: Boolean(r.linkedPerformerId || r.linkedSponsorId || r.linkedCrewId),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export const decisionSchema = z.object({
  decision: z.enum(["approve", "revise", "reject"]),
  note: z.string().trim().max(500).optional().default(""),
});

const localPhone = (wa: string) => (wa.startsWith("62") ? `0${wa.slice(2)}` : wa);

/** Setujui = buat & tautkan penampil (konfirmasi, tampil website) / sponsor (tampil website) / panitia. Sudah tertaut → tidak dibuat ulang. */
async function linkOnApprove(row: Row, event: { id: string; title: string }, garage: GarageSession) {
  const db = getDb();
  if (row.type === "creator") {
    if (row.linkedPerformerId) return { linkedPerformerId: row.linkedPerformerId };
    const lineup = await import("@/lib/event-lineup-service");
    // Nama yang sama di lineup event (mis. hasil impor) → tautkan, jangan dobel.
    const existing = (await db.select({ id: eventPerformers.id, name: eventPerformers.name }).from(eventPerformers).where(eq(eventPerformers.eventId, event.id))).find(
      (p) => lineupKey(p.name) === lineupKey(row.name),
    );
    const performer =
      existing ??
      (await lineup.createPerformer(
        {
          eventId: event.id,
          name: row.name.slice(0, 80),
          kind: creatorKind(row.category),
          status: "konfirmasi",
          showOnWebsite: true,
          instagram: row.instagram ? `@${row.instagram}` : null,
          contactName: row.pic.slice(0, 80),
          contactPhone: localPhone(row.whatsapp),
          memberCount: row.members ? Math.min(50, row.members) : null,
          techRider: row.tech,
          notes: [row.description, row.portfolio ? `Portofolio: ${row.portfolio}` : null, row.diet ? `Konsumsi: ${row.diet}` : null, "Dari pendaftaran website."].filter(Boolean).join("\n").slice(0, 1000),
        },
        garage,
      ));
    if (row.logoUrl && !existing) await lineup.setPerformerLogo(performer.id, row.logoUrl, garage);
    return { linkedPerformerId: performer.id };
  }
  if (row.type === "sponsor") {
    if (row.linkedSponsorId) return { linkedSponsorId: row.linkedSponsorId };
    const sponsors = await import("@/lib/event-sponsor-service");
    const created = await sponsors.createSponsor(
      {
        eventId: event.id,
        eventName: event.title,
        name: row.name,
        contactName: row.pic.slice(0, 80),
        contactPhone: localPhone(row.whatsapp),
        instagram: row.instagram ? `@${row.instagram}` : null,
        showOnWebsite: true,
        agreedAmount: row.amount ?? 0,
        notes: [`Kategori: ${row.category ?? "-"}`, row.address ? `Alamat: ${row.address}` : null, row.description, "Dari pendaftaran website."].filter(Boolean).join("\n").slice(0, 1000),
      },
      garage,
    );
    if (row.logoUrl) await sponsors.setSponsorLogo(created.id, row.logoUrl, garage);
    return { linkedSponsorId: created.id };
  }
  if (row.linkedCrewId) return { linkedCrewId: row.linkedCrewId };
  const lineup = await import("@/lib/event-lineup-service");
  const crew = await lineup.createCrew(
    {
      eventId: event.id,
      name: row.name.slice(0, 80),
      role: crewRoleFor(row.role),
      phone: localPhone(row.whatsapp),
      duties: [row.role ? `Bidang: ${row.role}` : null, row.attendance ? `Hadir: ${row.attendance}` : null, row.members ? `${row.members} orang` : null, row.diet ? `Konsumsi: ${row.diet}` : null]
        .filter(Boolean)
        .join("\n"),
    },
    garage,
  );
  return { linkedCrewId: crew.id };
}

export async function decideRegistration(id: string, raw: unknown, garage: GarageSession) {
  assertOwnerHuman(garage);
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw new RegistrationError("INVALID", firstIssue(parsed.error));
  const { decision, note } = parsed.data;
  if (decision !== "approve" && !note) throw new RegistrationError("NOTE_REQUIRED", "Tulis catatan untuk pendaftar (alasan revisi/penolakan).");
  const db = getDb();
  const [row] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, id)).limit(1);
  if (!row?.eventId) throw new RegistrationError("NOT_FOUND", "Pendaftar tidak ditemukan.", 404);
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, row.eventId)).limit(1);
  if (!event) throw new RegistrationError("NOT_FOUND", "Event pendaftar tidak ditemukan.", 404);
  const links = decision === "approve" ? await linkOnApprove(row, event, garage) : {};
  const status = decision === "approve" ? "disetujui" : decision === "revise" ? "revisi" : "ditolak";
  const now = new Date();
  const [updated] = await db
    .update(eventRegistrations)
    .set({ status, reviewNote: note || null, reviewedBy: garage.user.id, reviewedAt: now, updatedAt: now, ...links })
    .where(eq(eventRegistrations.id, id))
    .returning();
  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action: decision === "approve" ? "Setujui pendaftar GIGS" : decision === "revise" ? "Minta revisi pendaftar GIGS" : "Tolak pendaftar GIGS",
    object: `${row.name} (${row.type})`,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "event-registration", registrationId: id, eventId: event.id, before: { status: row.status }, after: { status, note: note || null, ...links } },
  });
  return { id: updated.id, status: updated.status };
}

// ─── Panitia (ketua/sekretaris): lihat saja, tanpa kontak & nominal ──────────

export async function panitiaRegistrations(eventId: string, garage: GarageSession) {
  if (garage.profile.agentKey) throw new RegistrationError("HUMAN_SESSION_REQUIRED", "Hanya untuk akun yang login langsung.", 403);
  const [membership] = await getDb()
    .select({ role: eventCrew.role })
    .from(eventCrew)
    .where(and(eq(eventCrew.userId, garage.user.id), eq(eventCrew.status, "aktif"), eq(eventCrew.eventId, eventId), sql`${eventCrew.role} in ('ketua','sekretaris')`))
    .limit(1);
  if (!membership) throw new RegistrationError("FORBIDDEN", "Daftar pendaftar hanya untuk ketua/sekretaris panitia event ini.", 403);
  const rows = await getDb().select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId)).orderBy(desc(eventRegistrations.createdAt));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    name: r.name,
    category: r.category,
    role: r.role,
    instagram: r.instagram,
    members: r.members,
    createdAt: r.createdAt.toISOString(),
  }));
}
