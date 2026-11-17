import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  cashLedgerEntries,
  eventSponsorInkind,
  eventSponsorInstallments,
  eventSponsorObligations,
  eventSponsorPayments,
  eventSponsors,
  events,
  financialSnapshots,
  staffProfiles,
} from "@/db/schema";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { businessDateOf, postAccountCash } from "@/lib/cash-ledger";
import {
  cleanSponsorPhone,
  installmentSchedule,
  isIsoDate,
  obligationState,
  rupiah,
  scheduleProblem,
  sponsorHealth,
  sponsorMoney,
  sponsorReminders,
  unscheduledAmount,
  wibDate,
  type SponsorStatus,
} from "@/lib/event-sponsor-rules";
import { EventRefError, findEventForPlatform, listMasterEvents, resolveEventRef } from "@/lib/event-master";
import { createAuditLog } from "@/lib/garage-service";
import { parseInstagramHandle } from "@/lib/gigs-lineup";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Sponsor Event (owner 16 Nov 2026). OWNER SAJA, login langsung (bukan API key agent).
// Uang sponsor SELALU masuk Rekening Jago → satu baris buku kas per pembayaran
// (external → bank_jago, `sponsor_income`), batal = baris pembalik. Laba rugi membaca
// buku kas sebagai "Pendapatan lain". Sponsor barang hanya catatan (tidak masuk kas).
// =============================================================================

export class SponsorError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "SponsorError";
  }
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const SPONSOR_ACCOUNT = "bank_jago" as const;

function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new SponsorError("FORBIDDEN", "Data sponsor hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new SponsorError("HUMAN_SESSION_REQUIRED", "Data sponsor hanya untuk Owner yang login langsung.", 403);
}

const actorName = (garage: GarageSession) => garage.user.name ?? "Owner";

async function audit(garage: GarageSession, action: string, object: string, metadata: Record<string, unknown>) {
  await createAuditLog({ actor: actorName(garage), action, object, device: garage.profile.deviceLabel ?? "Garage OS", metadata: { module: "sponsor-event", ...metadata } });
}

// ─── Skema input ────────────────────────────────────────────────────────────

const dateString = z.string().refine(isIsoDate, "Tanggal tidak valid (format YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const sponsorInputSchema = z.object({
  eventName: z.string().trim().min(2, "Nama event wajib diisi.").max(120),
  eventId: z.string().uuid().nullable().optional(),
  eventDate: dateString.nullable().optional(),
  name: z.string().trim().min(2, "Nama sponsor wajib diisi.").max(120),
  contactName: optionalText(80),
  contactPhone: optionalText(24),
  packageName: optionalText(60),
  // Tampilan publik: tautan https (opsional) + tampil di website event (default tidak).
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "Tautan harus diawali https://")
    .nullable()
    .optional(),
  // Akun Instagram ("@akun" / tautan profil); di website, klik logo sponsor membuka profil ini.
  instagram: optionalText(80),
  showOnWebsite: z.boolean().optional(),
  agreedAmount: z.number().int("Nilai kesepakatan harus rupiah bulat.").min(0).max(10_000_000_000),
  notes: optionalText(1000),
});
export type SponsorInput = z.infer<typeof sponsorInputSchema>;

export const sponsorUpdateSchema = sponsorInputSchema.partial();

export const installmentsSchema = z.object({
  installments: z
    .array(z.object({ label: z.string().trim().min(1).max(40), amount: z.number().int().positive(), dueDate: dateString }))
    .max(24, "Maksimal 24 cicilan."),
});

export const paymentSchema = z.object({
  amount: z.number().int("Nominal harus rupiah bulat.").positive("Nominal harus lebih dari 0."),
  receivedAt: z.string().datetime({ offset: true }).or(dateString),
  reference: z.string().trim().min(4, "Nomor referensi mutasi minimal 4 karakter.").max(80),
  note: optionalText(300),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const obligationSchema = z.object({
  title: z.string().trim().min(2, "Kewajiban wajib diisi.").max(160),
  dueDate: dateString.nullable().optional(),
});

export const inkindSchema = z.object({
  item: z.string().trim().min(2, "Nama barang wajib diisi.").max(120),
  qty: z.number().int().positive().max(1_000_000),
  unit: optionalText(20),
  estimatedValue: z.number().int().min(0).max(10_000_000_000),
  receivedAt: dateString.nullable().optional(),
  note: optionalText(300),
});

// ─── Baca ───────────────────────────────────────────────────────────────────

type SponsorRow = typeof eventSponsors.$inferSelect;

async function loadSponsor(db: Db | Tx, id: string) {
  const [row] = await db.select().from(eventSponsors).where(eq(eventSponsors.id, id)).limit(1);
  if (!row) throw new SponsorError("NOT_FOUND", "Sponsor tidak ditemukan.", 404);
  return row;
}

async function loadChildren(db: Db, ids: string[]) {
  if (!ids.length) return { installments: [], payments: [], obligations: [], inkind: [] };
  const [installments, payments, obligations, inkind] = await Promise.all([
    db.select().from(eventSponsorInstallments).where(inArray(eventSponsorInstallments.sponsorId, ids)).orderBy(asc(eventSponsorInstallments.seq)),
    db.select().from(eventSponsorPayments).where(inArray(eventSponsorPayments.sponsorId, ids)).orderBy(desc(eventSponsorPayments.receivedAt)),
    db
      .select()
      .from(eventSponsorObligations)
      .where(and(inArray(eventSponsorObligations.sponsorId, ids), isNull(eventSponsorObligations.archivedAt)))
      .orderBy(asc(eventSponsorObligations.dueDate), asc(eventSponsorObligations.createdAt)),
    db
      .select()
      .from(eventSponsorInkind)
      .where(and(inArray(eventSponsorInkind.sponsorId, ids), isNull(eventSponsorInkind.archivedAt)))
      .orderBy(asc(eventSponsorInkind.createdAt)),
  ]);
  return { installments, payments, obligations, inkind };
}

function buildView(row: SponsorRow, children: Awaited<ReturnType<typeof loadChildren>>, today: string) {
  const own = <T extends { sponsorId: string }>(list: T[]) => list.filter((item) => item.sponsorId === row.id);
  const payments = own(children.payments);
  const posted = payments.filter((p) => p.status === "posted");
  const money = sponsorMoney(row.agreedAmount, posted.map((p) => p.amount));
  const installments = installmentSchedule(
    own(children.installments).map((i) => ({ id: i.id, seq: i.seq, label: i.label, amount: i.amount, dueDate: String(i.dueDate) })),
    money.paid,
    today,
  );
  const obligations = own(children.obligations).map((o) => {
    const base = { id: o.id, title: o.title, dueDate: o.dueDate ? String(o.dueDate) : null, doneAt: o.doneAt ? o.doneAt.toISOString() : null };
    return { ...base, state: obligationState(base, today), doneNote: o.doneNote, hasProof: Boolean(o.proofPath) };
  });
  const inkind = own(children.inkind).map((k) => ({
    id: k.id,
    item: k.item,
    qty: k.qty,
    unit: k.unit,
    estimatedValue: k.estimatedValue,
    receivedAt: k.receivedAt ? String(k.receivedAt) : null,
    note: k.note,
  }));
  const inkindValue = inkind.reduce((sum, k) => sum + k.estimatedValue, 0);
  return {
    id: row.id,
    sponsorNo: row.sponsorNo,
    eventId: row.eventId,
    eventName: row.eventName,
    eventDate: row.eventDate ? String(row.eventDate) : null,
    name: row.name,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    packageName: row.packageName,
    logoUrl: row.logoUrl,
    websiteUrl: row.websiteUrl,
    instagram: row.instagram,
    showOnWebsite: row.showOnWebsite,
    status: row.status as SponsorStatus,
    notes: row.notes,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    money,
    unscheduled: unscheduledAmount(installments, row.agreedAmount),
    installments,
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      receivedAt: p.receivedAt.toISOString(),
      reference: p.reference,
      note: p.note,
      status: p.status as "posted" | "void",
      voidReason: p.voidReason,
      hasProof: Boolean(p.proofPath),
    })),
    obligations,
    inkind,
    health: sponsorHealth({ agreed: row.agreedAmount, paid: money.paid, installments, obligations, inkindValue }, today),
  };
}

export type SponsorView = ReturnType<typeof buildView>;

export async function listSponsors(garage: GarageSession, options: { eventName?: string | null; now?: Date } = {}) {
  assertOwnerHuman(garage);
  const db = getDb();
  const rows = await db
    .select()
    .from(eventSponsors)
    .where(options.eventName ? eq(eventSponsors.eventName, options.eventName) : undefined)
    .orderBy(desc(eventSponsors.createdAt));
  const children = await loadChildren(db, rows.map((r) => r.id));
  const today = wibDate(options.now);
  const sponsors = rows.map((row) => buildView(row, children, today));
  const active = sponsors.filter((s) => s.status !== "batal");
  const eventNames = [...new Set(rows.map((r) => r.eventName))];
  const masterEvents = await listMasterEvents();
  return {
    today,
    sponsors,
    events: eventNames,
    masterEvents,
    totals: {
      sponsors: active.length,
      agreed: active.reduce((sum, s) => sum + s.money.agreed, 0),
      // Uang yang masuk dihitung dari SEMUA sponsor (termasuk yang batal): uangnya benar-benar ada di rekening.
      paid: sponsors.reduce((sum, s) => sum + s.money.paid, 0),
      remaining: active.reduce((sum, s) => sum + s.money.remaining, 0),
      overdue: active.reduce((sum, s) => sum + s.health.overdueAmount, 0),
      inkind: active.reduce((sum, s) => sum + s.health.inkindValue, 0),
      obligationsLate: active.reduce((sum, s) => sum + s.health.obligationsLate, 0),
    },
  };
}

export async function getSponsor(id: string, garage: GarageSession, now = new Date()) {
  assertOwnerHuman(garage);
  const db = getDb();
  const row = await loadSponsor(db, id);
  return buildView(row, await loadChildren(db, [row.id]), wibDate(now));
}

/** Pilihan event Garage OS (opsional ditautkan). Event GIGS cukup ditulis namanya. */
export async function sponsorEventOptions(garage: GarageSession) {
  assertOwnerHuman(garage);
  const rows = await getDb()
    .select({ id: events.id, title: events.title, startsAt: events.startsAt })
    .from(events)
    .orderBy(desc(events.startsAt))
    .limit(50);
  return rows.map((r) => ({ id: r.id, title: r.title, date: wibDate(r.startsAt) }));
}

// ─── Tulis: sponsor ─────────────────────────────────────────────────────────

async function nextSponsorNo(tx: Tx, now: Date) {
  const ym = wibDate(now).slice(2, 7).replace("-", "");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('event_sponsor_no'))`);
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(eventSponsors)
    .where(sql`${eventSponsors.sponsorNo} like ${`SPN-${ym}-%`}`);
  return `SPN-${ym}-${String(Number(row?.n ?? 0) + 1).padStart(3, "0")}`;
}

function cleanInput(input: Partial<SponsorInput>) {
  const out: Partial<typeof eventSponsors.$inferInsert> = {};
  if (input.eventName !== undefined) out.eventName = input.eventName.trim();
  if (input.eventId !== undefined) out.eventId = input.eventId || null;
  if (input.eventDate !== undefined) out.eventDate = input.eventDate || null;
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.contactName !== undefined) out.contactName = input.contactName?.trim() || null;
  if (input.contactPhone !== undefined) {
    try {
      out.contactPhone = cleanSponsorPhone(input.contactPhone);
    } catch (error) {
      throw new SponsorError("INVALID_PHONE", error instanceof Error ? error.message : "Nomor WhatsApp tidak valid.");
    }
  }
  if (input.packageName !== undefined) out.packageName = input.packageName?.trim() || null;
  if (input.websiteUrl !== undefined) out.websiteUrl = input.websiteUrl?.trim() || null;
  if (input.showOnWebsite !== undefined) out.showOnWebsite = input.showOnWebsite;
  if (input.instagram !== undefined) {
    try {
      out.instagram = parseInstagramHandle(input.instagram);
    } catch {
      throw new SponsorError("INVALID_INSTAGRAM", "Akun Instagram sponsor tidak valid.");
    }
  }
  if (input.agreedAmount !== undefined) out.agreedAmount = input.agreedAmount;
  if (input.notes !== undefined) out.notes = input.notes?.trim() || null;
  return out;
}

/** Master event (GIGS EO Fase 1): `eventId` → nama = judul master; nama yang sama dengan satu master ikut ditautkan. */
async function withEventRef(values: Partial<typeof eventSponsors.$inferInsert>, input: Partial<SponsorInput>) {
  if (input.eventId === undefined && input.eventName === undefined) return values;
  try {
    const ref = await resolveEventRef({ eventId: input.eventId ?? null, eventName: input.eventName ?? null });
    return { ...values, eventId: ref.eventId, eventName: ref.eventName };
  } catch (error) {
    if (error instanceof EventRefError) throw new SponsorError(error.code, error.message, error.status);
    throw error;
  }
}

export async function createSponsor(input: SponsorInput, garage: GarageSession, now = new Date()) {
  assertOwnerHuman(garage);
  const values = await withEventRef(cleanInput(input), input);
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    const sponsorNo = await nextSponsorNo(tx, now);
    const [created] = await tx
      .insert(eventSponsors)
      .values({
        ...values,
        sponsorNo,
        eventName: values.eventName!,
        name: values.name!,
        agreedAmount: values.agreedAmount ?? 0,
        outletId: garage.profile.outlet.id,
        createdBy: garage.user.id,
      })
      .returning();
    return created;
  });
  await audit(garage, "Sponsor dibuat", row.sponsorNo, { sponsorId: row.id, name: row.name, eventName: row.eventName, agreedAmount: row.agreedAmount });
  return getSponsor(row.id, garage, now);
}

export async function updateSponsor(id: string, input: Partial<SponsorInput>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const before = await loadSponsor(db, id);
  if (before.status === "batal") throw new SponsorError("CANCELLED", "Sponsor yang sudah batal tidak bisa diubah.", 409);
  const values = await withEventRef(cleanInput(input), input);
  if (values.agreedAmount !== undefined) {
    const installments = await db.select().from(eventSponsorInstallments).where(eq(eventSponsorInstallments.sponsorId, id));
    const problem = scheduleProblem(installments.map((i) => ({ label: i.label, amount: i.amount, dueDate: String(i.dueDate) })), values.agreedAmount);
    if (problem) throw new SponsorError("SCHEDULE_EXCEEDS", `${problem} Ubah jadwal cicilan dulu.`, 409);
  }
  await db.update(eventSponsors).set({ ...values, updatedAt: new Date() }).where(eq(eventSponsors.id, id));
  await audit(garage, "Sponsor diubah", before.sponsorNo, {
    sponsorId: id,
    before: {
      name: before.name,
      eventName: before.eventName,
      packageName: before.packageName,
      agreedAmount: before.agreedAmount,
      websiteUrl: before.websiteUrl,
      instagram: before.instagram,
      showOnWebsite: before.showOnWebsite,
    },
    after: values,
  });
  return getSponsor(id, garage);
}

/** Logo sponsor (webp di /garage-uploads/event-sponsor) atau null = hapus. Tidak menyentuh uang. */
export async function setSponsorLogo(id: string, logoUrl: string | null, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const before = await loadSponsor(db, id);
  await db.update(eventSponsors).set({ logoUrl, updatedAt: new Date() }).where(eq(eventSponsors.id, id));
  await audit(garage, logoUrl ? "Logo sponsor diganti" : "Logo sponsor dihapus", before.sponsorNo, {
    sponsorId: id,
    before: { logoUrl: before.logoUrl },
    after: { logoUrl },
  });
  return getSponsor(id, garage);
}

// ─── Website (publik) ───────────────────────────────────────────────────────

export type PublicSponsor = { name: string; logo: string | null; url: string | null; instagram: string | null; packageName: string | null };

/**
 * Sponsor yang dicentang "tampil di website" untuk event GIGS di beranda (slug platform → master, lalu nama).
 * Hanya nama, logo, tautan, paket — TIDAK PERNAH nilai uang, kontak, atau catatan. Sponsor batal tidak tampil.
 */
export async function publicSponsorsFor(platform: { slug: string; name: string }): Promise<PublicSponsor[]> {
  const master = await findEventForPlatform(platform).catch(() => null);
  const name = (master?.title ?? platform.name).trim();
  if (!name) return [];
  const rows = await getDb()
    .select({
      name: eventSponsors.name,
      logoUrl: eventSponsors.logoUrl,
      websiteUrl: eventSponsors.websiteUrl,
      instagram: eventSponsors.instagram,
      packageName: eventSponsors.packageName,
    })
    .from(eventSponsors)
    .where(
      and(
        master
          ? sql`(${eventSponsors.eventId} = ${master.id} or (${eventSponsors.eventId} is null and lower(${eventSponsors.eventName}) = lower(${name})))`
          : sql`lower(${eventSponsors.eventName}) = lower(${name})`,
        eq(eventSponsors.showOnWebsite, true),
        sql`${eventSponsors.status} <> 'batal'`,
      ),
    )
    .orderBy(asc(eventSponsors.createdAt))
    .limit(24);
  return rows.map((r) => ({ name: r.name, logo: r.logoUrl, url: r.websiteUrl, instagram: r.instagram, packageName: r.packageName }));
}

export async function setSponsorStatus(id: string, status: SponsorStatus, reason: string | null, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const before = await loadSponsor(db, id);
  if (before.status === status) return getSponsor(id, garage);
  if (before.status === "batal") throw new SponsorError("CANCELLED", "Sponsor yang sudah batal tidak bisa diaktifkan lagi. Buat catatan sponsor baru.", 409);
  if (status === "batal" && (!reason || reason.trim().length < 3)) throw new SponsorError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  await db
    .update(eventSponsors)
    .set({ status, cancelReason: status === "batal" ? reason!.trim() : null, updatedAt: new Date() })
    .where(eq(eventSponsors.id, id));
  await audit(garage, status === "batal" ? "Sponsor dibatalkan" : `Status sponsor: ${status}`, before.sponsorNo, { sponsorId: id, before: before.status, after: status, reason });
  return getSponsor(id, garage);
}

// ─── Tulis: jadwal cicilan ─────────────────────────────────────────────────

export async function setInstallments(id: string, input: z.infer<typeof installmentsSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const sponsor = await loadSponsor(db, id);
  if (sponsor.status === "batal") throw new SponsorError("CANCELLED", "Sponsor yang sudah batal tidak bisa diubah.", 409);
  const problem = scheduleProblem(input.installments, sponsor.agreedAmount);
  if (problem) throw new SponsorError("INVALID_SCHEDULE", problem);
  await db.transaction(async (tx) => {
    await tx.delete(eventSponsorInstallments).where(eq(eventSponsorInstallments.sponsorId, id));
    if (input.installments.length) {
      await tx.insert(eventSponsorInstallments).values(
        input.installments.map((item, index) => ({ sponsorId: id, seq: index + 1, label: item.label.trim(), amount: item.amount, dueDate: item.dueDate })),
      );
    }
  });
  await audit(garage, "Jadwal cicilan sponsor diubah", sponsor.sponsorNo, { sponsorId: id, installments: input.installments });
  return getSponsor(id, garage);
}

// ─── Tulis: uang masuk (buku kas Rekening Jago) ────────────────────────────

/** Pelanggaran UNIQUE dari Postgres/PGlite (drizzle membungkus galat asli di `cause`). */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "23505" || /duplicate key|unique constraint/i.test(String((current as { message?: unknown }).message ?? ""))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Tanggal saja: hari ini = saat dicatat; hari lampau = 12.00 WIB hari itu (tidak pernah "di masa depan"). */
function parseReceivedAt(value: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  if (value === wibDate(now)) return now;
  return new Date(`${value}T12:00:00+07:00`);
}

/**
 * Catat uang sponsor yang SUDAH masuk Rekening Jago. Satu transaksi: baris pembayaran + baris buku kas
 * external → bank_jago. Idempoten lewat `idempotencyKey`; referensi mutasi tidak boleh dobel.
 */
export async function recordSponsorPayment(id: string, input: z.infer<typeof paymentSchema>, garage: GarageSession, now = new Date()) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [replay] = await db.select().from(eventSponsorPayments).where(eq(eventSponsorPayments.idempotencyKey, input.idempotencyKey)).limit(1);
  if (replay) {
    if (replay.sponsorId !== id || replay.amount !== input.amount) throw new SponsorError("IDEMPOTENCY_MISMATCH", "Permintaan ganda dengan isi berbeda. Muat ulang lalu coba lagi.", 409);
    return { payment: { id: replay.id }, replay: true, lockedDayWarning: null, sponsor: await getSponsor(id, garage, now) };
  }
  const sponsor = await loadSponsor(db, id);
  if (sponsor.status === "batal") throw new SponsorError("CANCELLED", "Sponsor sudah batal. Bila uang tetap masuk, aktifkan catatan sponsor baru.", 409);
  const receivedAt = parseReceivedAt(input.receivedAt, now);
  if (Number.isNaN(receivedAt.getTime())) throw new SponsorError("INVALID_DATE", "Tanggal uang masuk tidak valid.");
  if (receivedAt.getTime() > now.getTime() + 5 * 60_000) throw new SponsorError("FUTURE_DATE", "Tanggal uang masuk tidak boleh di masa depan.");
  const reference = input.reference.trim();
  let payment: typeof eventSponsorPayments.$inferSelect;
  try {
    payment = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(eventSponsorPayments)
        .values({ sponsorId: id, amount: input.amount, receivedAt, reference, note: input.note?.trim() || null, idempotencyKey: input.idempotencyKey, createdBy: garage.user.id })
        .returning();
      await postAccountCash(tx, {
        from: "external",
        to: SPONSOR_ACCOUNT,
        amount: input.amount,
        outletId: sponsor.outletId ?? garage.profile.outlet.id,
        sourceType: "sponsor_income",
        sourceId: row.id,
        sourceRef: `${sponsor.sponsorNo} · ${sponsor.name} · Ref ${reference}`,
        actorUserId: garage.user.id,
        approverUserId: garage.user.id,
        note: sponsor.eventName,
        occurredAt: receivedAt,
        idempotencyKey: `sponsor_income:${row.id}`,
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new SponsorError("DUPLICATE_REFERENCE", "Nomor referensi mutasi ini sudah pernah dicatat.", 409);
    throw error;
  }
  await audit(garage, "Uang sponsor masuk Rekening Jago", sponsor.sponsorNo, { sponsorId: id, paymentId: payment.id, amount: input.amount, reference });
  return { payment: { id: payment.id }, replay: false, lockedDayWarning: await lockedDayWarning(receivedAt), sponsor: await getSponsor(id, garage, now) };
}

/** Hari yang sudah dikunci Daily Closing tidak dihitung ulang: uang tetap masuk buku kas, laba rugi hari itu tetap. */
async function lockedDayWarning(at: Date) {
  const db = getDb();
  const day = businessDateOf(at, await loadBusinessDayPolicy(db));
  const [row] = await db
    .select({ status: financialSnapshots.status })
    .from(financialSnapshots)
    .where(and(eq(financialSnapshots.date, day), eq(financialSnapshots.status, "locked")))
    .limit(1);
  return row ? `Hari ${day} sudah dikunci (Daily Closing). Uang tercatat di buku kas Rekening Jago, tetapi laba rugi hari itu tidak berubah.` : null;
}

export async function voidSponsorPayment(paymentId: string, reason: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  if (!reason || reason.trim().length < 3) throw new SponsorError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  const db = getDb();
  const [payment] = await db.select().from(eventSponsorPayments).where(eq(eventSponsorPayments.id, paymentId)).limit(1);
  if (!payment) throw new SponsorError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  if (payment.status === "void") throw new SponsorError("ALREADY_VOID", "Pembayaran ini sudah dibatalkan.", 409);
  const sponsor = await loadSponsor(db, payment.sponsorId);
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(eventSponsorPayments)
      .set({ status: "void", voidReason: reason.trim(), voidedBy: garage.user.id, voidedAt: new Date() })
      .where(and(eq(eventSponsorPayments.id, paymentId), eq(eventSponsorPayments.status, "posted")))
      .returning({ id: eventSponsorPayments.id });
    if (!changed.length) throw new SponsorError("ALREADY_VOID", "Pembayaran ini sudah dibatalkan.", 409);
    // Buku kas tidak pernah diubah: baris pembalik bank_jago → external.
    const [posted] = await tx
      .select()
      .from(cashLedgerEntries)
      .where(and(eq(cashLedgerEntries.sourceType, "sponsor_income"), eq(cashLedgerEntries.sourceId, paymentId)))
      .limit(1);
    if (posted) {
      const [already] = await tx.select({ id: cashLedgerEntries.id }).from(cashLedgerEntries).where(eq(cashLedgerEntries.reversesId, posted.id)).limit(1);
      if (!already) {
        await postAccountCash(tx, {
          from: SPONSOR_ACCOUNT,
          to: "external",
          amount: posted.amount,
          outletId: posted.outletId,
          sourceType: "sponsor_income_void",
          sourceId: paymentId,
          sourceRef: posted.sourceRef,
          reversesId: posted.id,
          actorUserId: garage.user.id,
          approverUserId: garage.user.id,
          note: reason.trim(),
          idempotencyKey: `sponsor_income_void:${paymentId}`,
        });
      }
    }
  });
  await audit(garage, "Uang sponsor dibatalkan", sponsor.sponsorNo, { sponsorId: sponsor.id, paymentId, amount: payment.amount, reference: payment.reference, reason: reason.trim() });
  return getSponsor(sponsor.id, garage);
}

export async function sponsorPaymentProofPath(paymentId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const [row] = await getDb().select().from(eventSponsorPayments).where(eq(eventSponsorPayments.id, paymentId)).limit(1);
  if (!row) throw new SponsorError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  return row;
}

export async function setSponsorPaymentProof(paymentId: string, proofPath: string, garage: GarageSession) {
  const row = await sponsorPaymentProofPath(paymentId, garage);
  await getDb().update(eventSponsorPayments).set({ proofPath }).where(eq(eventSponsorPayments.id, paymentId));
  await audit(garage, "Bukti uang sponsor diunggah", row.reference, { paymentId, sponsorId: row.sponsorId });
  return { id: paymentId, hasProof: true };
}

// ─── Tulis: kewajiban ke sponsor ───────────────────────────────────────────

export async function addObligation(id: string, input: z.infer<typeof obligationSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const sponsor = await loadSponsor(db, id);
  const [row] = await db.insert(eventSponsorObligations).values({ sponsorId: id, title: input.title.trim(), dueDate: input.dueDate || null }).returning();
  await audit(garage, "Kewajiban sponsor ditambah", sponsor.sponsorNo, { sponsorId: id, obligationId: row.id, title: row.title, dueDate: row.dueDate });
  return getSponsor(id, garage);
}

async function loadObligation(obligationId: string) {
  const [row] = await getDb().select().from(eventSponsorObligations).where(eq(eventSponsorObligations.id, obligationId)).limit(1);
  if (!row || row.archivedAt) throw new SponsorError("OBLIGATION_NOT_FOUND", "Kewajiban tidak ditemukan.", 404);
  return row;
}

export async function updateObligation(
  obligationId: string,
  input: { title?: string; dueDate?: string | null; done?: boolean; doneNote?: string | null; archive?: boolean },
  garage: GarageSession,
) {
  assertOwnerHuman(garage);
  const row = await loadObligation(obligationId);
  const patch: Partial<typeof eventSponsorObligations.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate || null;
  if (input.done === true && !row.doneAt) Object.assign(patch, { doneAt: new Date(), doneBy: garage.user.id, doneNote: input.doneNote?.trim() || null });
  if (input.done === false) Object.assign(patch, { doneAt: null, doneBy: null, doneNote: null });
  if (input.archive) {
    if (row.doneAt) throw new SponsorError("DONE_KEPT", "Kewajiban yang sudah selesai disimpan sebagai bukti, tidak bisa dihapus.", 409);
    patch.archivedAt = new Date();
  }
  if (Object.keys(patch).length) await getDb().update(eventSponsorObligations).set(patch).where(eq(eventSponsorObligations.id, obligationId));
  await audit(garage, input.archive ? "Kewajiban sponsor dihapus" : input.done === true ? "Kewajiban sponsor selesai" : "Kewajiban sponsor diubah", row.title, {
    sponsorId: row.sponsorId,
    obligationId,
    before: { title: row.title, dueDate: row.dueDate, done: Boolean(row.doneAt) },
    after: patch,
  });
  return getSponsor(row.sponsorId, garage);
}

export async function obligationProof(obligationId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  return loadObligation(obligationId);
}

export async function setObligationProof(obligationId: string, proofPath: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const row = await loadObligation(obligationId);
  await getDb().update(eventSponsorObligations).set({ proofPath }).where(eq(eventSponsorObligations.id, obligationId));
  await audit(garage, "Bukti kewajiban sponsor diunggah", row.title, { sponsorId: row.sponsorId, obligationId });
  return { id: obligationId, hasProof: true };
}

// ─── Tulis: sponsor barang (tidak masuk buku kas) ──────────────────────────

export async function addInkind(id: string, input: z.infer<typeof inkindSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const sponsor = await loadSponsor(db, id);
  const [row] = await db
    .insert(eventSponsorInkind)
    .values({
      sponsorId: id,
      item: input.item.trim(),
      qty: input.qty,
      unit: input.unit?.trim() || null,
      estimatedValue: input.estimatedValue,
      receivedAt: input.receivedAt || null,
      note: input.note?.trim() || null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Sponsor barang dicatat", sponsor.sponsorNo, { sponsorId: id, inkindId: row.id, item: row.item, qty: row.qty, estimatedValue: row.estimatedValue });
  return getSponsor(id, garage);
}

export async function archiveInkind(inkindId: string, reason: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  if (!reason || reason.trim().length < 3) throw new SponsorError("REASON_REQUIRED", "Alasan wajib diisi.");
  const db = getDb();
  const [row] = await db.select().from(eventSponsorInkind).where(eq(eventSponsorInkind.id, inkindId)).limit(1);
  if (!row || row.archivedAt) throw new SponsorError("INKIND_NOT_FOUND", "Catatan barang tidak ditemukan.", 404);
  await db.update(eventSponsorInkind).set({ archivedAt: new Date() }).where(eq(eventSponsorInkind.id, inkindId));
  await audit(garage, "Sponsor barang dihapus", row.item, { sponsorId: row.sponsorId, inkindId, reason: reason.trim(), before: { qty: row.qty, estimatedValue: row.estimatedValue } });
  return getSponsor(row.sponsorId, garage);
}

// ─── Pengingat (sweeper server) ────────────────────────────────────────────

/** Pengingat cicilan & kewajiban ke HP Owner. Aman diulang: tiap pengingat punya kunci dedup per Owner. */
export async function sweepSponsorReminders(now = new Date()) {
  const db = getDb();
  const rows = await db.select().from(eventSponsors).where(eq(eventSponsors.status, "aktif"));
  if (!rows.length) return { sent: 0 };
  const children = await loadChildren(db, rows.map((r) => r.id));
  const today = wibDate(now);
  const reminders = rows.flatMap((row) => {
    const view = buildView(row, children, today);
    return sponsorReminders({ id: row.id, sponsorNo: row.sponsorNo, name: row.name, eventName: row.eventName, status: row.status, installments: view.installments, obligations: view.obligations }, today);
  });
  if (!reminders.length) return { sent: 0 };
  const owners = await db
    .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
  const { notifyStaff } = await import("@/lib/staff-notifications");
  let sent = 0;
  for (const reminder of reminders) {
    for (const owner of owners) {
      const row = await notifyStaff({
        outletId: owner.outletId,
        audience: "user",
        userId: owner.userId,
        kind: "sponsor_reminder",
        severity: reminder.severity,
        title: reminder.title,
        body: reminder.body,
        url: "/control/sponsors",
        dedupKey: `${reminder.key}:${owner.userId}`,
      }).catch(() => null);
      if (row) sent += 1;
    }
  }
  return { sent };
}

export { rupiah };
