import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { cashLedgerEntries, eventBudgetLines, eventExpensePayments, eventPerformers, eventReviews, events } from "@/db/schema";
import { postAccountCash } from "@/lib/cash-ledger";
import {
  budgetSummary,
  EVENT_COST_CATEGORIES,
  EVENT_COST_LABEL,
  EVENT_PAY_SOURCE_LABEL,
  EVENT_PAY_SOURCES,
  eventProfit,
  type EventCostCategory,
  type EventPaySource,
} from "@/lib/event-finance-rules";
import { listMasterEvents } from "@/lib/event-master";
import { wibDate } from "@/lib/event-sponsor-rules";
import { createAuditLog } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Keuangan Event (GIGS EO Fase 2, Owner 17 Nov 2026): anggaran per pos, pembayaran biaya (buku kas), untung/rugi.
// OWNER SAJA, login langsung (bukan Manajer / API key agent). Uang keluar dari rekening = satu baris buku kas
// `event_expense` dalam tx yang sama; uang pribadi Owner tanpa baris kas tetapi tetap biaya di laba rugi.
// Koreksi = batal + baris pembalik `event_expense_void`; riwayat tidak pernah diedit/dihapus.
// =============================================================================

export class EventFinanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EventFinanceError";
  }
}

function assertOwnerHuman(garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new EventFinanceError("FORBIDDEN", "Keuangan event hanya untuk Owner.", 403);
  if (garage.profile.agentKey) throw new EventFinanceError("HUMAN_SESSION_REQUIRED", "Keuangan event hanya untuk Owner yang login langsung.", 403);
}

async function audit(garage: GarageSession, action: string, object: string, metadata: Record<string, unknown>) {
  await createAuditLog({
    actor: garage.user.name ?? "Owner",
    action,
    object,
    device: garage.profile.deviceLabel ?? "Garage OS",
    metadata: { module: "event-finance", ...metadata },
  });
}

// ─── Skema ──────────────────────────────────────────────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const rupiah = z.number().int("Nominal harus rupiah bulat.");

export const budgetLineSchema = z.object({
  eventId: z.string().uuid(),
  category: z.enum(EVENT_COST_CATEGORIES),
  title: z.string().trim().min(2, "Nama pos biaya wajib diisi.").max(120),
  plannedAmount: rupiah.min(0, "Anggaran tidak boleh minus.").max(5_000_000_000),
  performerId: z.string().uuid().nullable().optional(),
  notes: optionalText(500),
});
export const budgetLinePatchSchema = budgetLineSchema.omit({ eventId: true }).partial().extend({ status: z.enum(["aktif", "arsip"]).optional() });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");
export const expensePaymentSchema = z.object({
  budgetLineId: z.string().uuid(),
  amount: rupiah.positive("Nominal harus lebih dari 0.").max(5_000_000_000),
  paidAt: z.string().datetime({ offset: true }).or(dateOnly),
  source: z.enum(EVENT_PAY_SOURCES),
  payee: z.string().trim().min(2, "Nama penerima wajib diisi.").max(120),
  reference: optionalText(80),
  note: optionalText(300),
  idempotencyKey: z.string().trim().min(8).max(100),
});

// ─── Helper ─────────────────────────────────────────────────────────────────

async function loadEvent(eventId: string) {
  const [row] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) throw new EventFinanceError("EVENT_NOT_FOUND", "Event tidak ditemukan.", 404);
  return row;
}

async function loadLine(id: string) {
  const [row] = await getDb().select().from(eventBudgetLines).where(eq(eventBudgetLines.id, id)).limit(1);
  if (!row) throw new EventFinanceError("LINE_NOT_FOUND", "Pos anggaran tidak ditemukan.", 404);
  return row;
}

async function assertPerformerOfEvent(performerId: string | null | undefined, eventId: string) {
  if (!performerId) return;
  const [row] = await getDb().select({ eventId: eventPerformers.eventId }).from(eventPerformers).where(eq(eventPerformers.id, performerId)).limit(1);
  if (!row) throw new EventFinanceError("PERFORMER_NOT_FOUND", "Penampil tidak ditemukan.", 404);
  if (row.eventId !== eventId) throw new EventFinanceError("PERFORMER_OTHER_EVENT", "Penampil harus dari event yang sama.");
}

function parsePaidAt(value: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  if (value === wibDate(now)) return now;
  return new Date(`${value}T12:00:00+07:00`);
}

const wibDay = (d: Date) => wibDate(d);

// ─── Baca ───────────────────────────────────────────────────────────────────

export async function getEventFinance(garage: GarageSession, eventId: string | null, now = new Date()) {
  assertOwnerHuman(garage);
  const masterEvents = await listMasterEvents();
  const id = eventId ?? masterEvents[0]?.id ?? null;
  if (!id) return { masterEvents, event: null };
  const event = await loadEvent(id);
  const db = getDb();
  const [lines, payments, performers] = await Promise.all([
    db.select().from(eventBudgetLines).where(eq(eventBudgetLines.eventId, id)).orderBy(asc(eventBudgetLines.category), asc(eventBudgetLines.createdAt)),
    db.select().from(eventExpensePayments).where(eq(eventExpensePayments.eventId, id)).orderBy(desc(eventExpensePayments.paidAt)),
    db
      .select({ id: eventPerformers.id, name: eventPerformers.name, status: eventPerformers.status })
      .from(eventPerformers)
      .where(eq(eventPerformers.eventId, id))
      .orderBy(asc(eventPerformers.name)),
  ]);
  const budget = budgetSummary(
    lines.map((l) => ({ id: l.id, category: l.category as EventCostCategory, title: l.title, plannedAmount: l.plannedAmount, status: l.status as "aktif" | "arsip" })),
    payments.map((p) => ({ budgetLineId: p.budgetLineId, amount: p.amount, status: p.status as "posted" | "void" })),
  );
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const performerName = new Map(performers.map((p) => [p.id, p.name]));

  // Uang sponsor event ini (master event) — dari modul Sponsor, termasuk sponsor batal yang uangnya sudah masuk.
  const { listSponsors } = await import("@/lib/event-sponsor-service");
  const sponsorList = await listSponsors(garage, { now });
  const sponsors = sponsorList.sponsors.filter((s) => s.eventId === id);
  const activeSponsors = sponsors.filter((s) => s.status !== "batal");
  const sponsor = {
    count: activeSponsors.length,
    agreed: activeSponsors.reduce((sum, s) => sum + s.money.agreed, 0),
    paid: sponsors.reduce((sum, s) => sum + s.money.paid, 0),
    remaining: activeSponsors.reduce((sum, s) => sum + s.money.remaining, 0),
    inkind: activeSponsors.reduce((sum, s) => sum + s.health.inkindValue, 0),
  };

  // Penjualan menu event (periode acara, WIB). Gagal dimuat = ditandai, bukan 0 diam-diam.
  let menu: { available: boolean; netSales: number; cost: number | null; paidBills: number; note: string | null } = {
    available: false,
    netSales: 0,
    cost: null,
    paidBills: 0,
    note: "Laporan penjualan menu event belum bisa dimuat.",
  };
  try {
    const { getEventSalesReport } = await import("@/lib/event-sales-report");
    const report = await getEventSalesReport({ eventId: id, outletId: event.outletId ?? garage.profile.outlet.id, from: wibDay(event.startsAt), to: wibDay(event.endsAt) });
    const noSales = report.summary.netSales === 0;
    menu = {
      available: true,
      netSales: report.summary.netSales,
      cost: noSales ? 0 : report.cost.total,
      paidBills: report.summary.paidBills,
      note: !noSales && report.cost.total === null ? "HPP menu event belum lengkap: penjualan dihitung tanpa dikurangi bahan." : null,
    };
  } catch {
    // tetap tampil dengan catatan di atas
  }

  const profit = eventProfit({
    menuNetSales: menu.netSales,
    menuCost: menu.cost,
    sponsorIn: sponsor.paid,
    sponsorPending: sponsor.remaining,
    costPaid: budget.totals.paid,
    costRemaining: budget.totals.remaining,
  });

  return {
    masterEvents,
    today: wibDate(now),
    event: { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), status: event.status },
    categories: EVENT_COST_CATEGORIES.map((c) => ({ value: c, label: EVENT_COST_LABEL[c] })),
    sources: EVENT_PAY_SOURCES.map((s) => ({ value: s, label: EVENT_PAY_SOURCE_LABEL[s] })),
    performers,
    budget: {
      ...budget,
      rows: budget.rows.map((row) => {
        const line = lineById.get(row.id)!;
        return { ...row, performerId: line.performerId, performerName: line.performerId ? performerName.get(line.performerId) ?? null : null, notes: line.notes };
      }),
    },
    payments: payments.map((p) => ({
      id: p.id,
      budgetLineId: p.budgetLineId,
      lineTitle: lineById.get(p.budgetLineId)?.title ?? "-",
      amount: p.amount,
      paidAt: p.paidAt.toISOString(),
      source: p.source as EventPaySource,
      sourceLabel: EVENT_PAY_SOURCE_LABEL[p.source as EventPaySource] ?? p.source,
      payee: p.payee,
      reference: p.reference,
      note: p.note,
      hasProof: Boolean(p.proofPath),
      status: p.status as "posted" | "void",
      voidReason: p.voidReason,
    })),
    sponsor,
    menu,
    profit,
    ...(await getEventReviewAndComparison(id, garage)),
  };
}

// ─── Tulis: anggaran ────────────────────────────────────────────────────────

export async function createBudgetLine(input: z.infer<typeof budgetLineSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const event = await loadEvent(input.eventId);
  await assertPerformerOfEvent(input.performerId, event.id);
  const [row] = await getDb()
    .insert(eventBudgetLines)
    .values({
      eventId: event.id,
      category: input.category,
      title: input.title,
      plannedAmount: input.plannedAmount,
      performerId: input.performerId ?? null,
      notes: input.notes?.trim() || null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah pos anggaran event", row.title, { eventId: event.id, lineId: row.id, category: row.category, plannedAmount: row.plannedAmount });
  return row;
}

export async function updateBudgetLine(id: string, patch: z.infer<typeof budgetLinePatchSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const before = await loadLine(id);
  if (patch.performerId !== undefined) await assertPerformerOfEvent(patch.performerId, before.eventId);
  const values: Partial<typeof eventBudgetLines.$inferInsert> = { updatedAt: new Date() };
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.plannedAmount !== undefined) values.plannedAmount = patch.plannedAmount;
  if (patch.performerId !== undefined) values.performerId = patch.performerId ?? null;
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) values.status = patch.status;
  const [row] = await getDb().update(eventBudgetLines).set(values).where(eq(eventBudgetLines.id, id)).returning();
  await audit(garage, patch.status === "arsip" ? "Arsipkan pos anggaran event" : "Ubah pos anggaran event", row.title, {
    eventId: row.eventId,
    lineId: id,
    before: { category: before.category, title: before.title, plannedAmount: before.plannedAmount, status: before.status },
    after: { category: row.category, title: row.title, plannedAmount: row.plannedAmount, status: row.status },
  });
  return row;
}

// ─── Tulis: pembayaran biaya ───────────────────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "23505" || /duplicate key|unique constraint/i.test(String((current as { message?: unknown }).message ?? ""))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Catat uang yang SUDAH dibayar untuk pos anggaran. Rekening (Jago/BNI) → satu baris buku kas `event_expense`
 * (rekening → external) dalam tx yang sama. Uang pribadi Owner: tanpa baris kas, tetap biaya event di laba rugi.
 * Idempoten lewat `idempotencyKey`.
 */
export async function recordExpensePayment(input: z.infer<typeof expensePaymentSchema>, garage: GarageSession, now = new Date()) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [replay] = await db.select().from(eventExpensePayments).where(eq(eventExpensePayments.idempotencyKey, input.idempotencyKey)).limit(1);
  if (replay) {
    if (replay.budgetLineId !== input.budgetLineId || replay.amount !== input.amount) {
      throw new EventFinanceError("IDEMPOTENCY_MISMATCH", "Permintaan ganda dengan isi berbeda. Muat ulang lalu coba lagi.", 409);
    }
    return { payment: replay, replay: true };
  }
  const line = await loadLine(input.budgetLineId);
  if (line.status !== "aktif") throw new EventFinanceError("LINE_ARCHIVED", "Pos anggaran sudah diarsipkan.", 409);
  const event = await loadEvent(line.eventId);
  const paidAt = parsePaidAt(input.paidAt, now);
  if (Number.isNaN(paidAt.getTime())) throw new EventFinanceError("INVALID_DATE", "Tanggal bayar tidak valid.");
  if (paidAt.getTime() > now.getTime() + 5 * 60_000) throw new EventFinanceError("FUTURE_DATE", "Tanggal bayar tidak boleh di masa depan.");
  let payment: typeof eventExpensePayments.$inferSelect;
  try {
    payment = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(eventExpensePayments)
        .values({
          eventId: event.id,
          budgetLineId: line.id,
          amount: input.amount,
          paidAt,
          source: input.source,
          payee: input.payee,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          idempotencyKey: input.idempotencyKey,
          createdBy: garage.user.id,
        })
        .returning();
      if (input.source !== "external") {
        await postAccountCash(tx, {
          from: input.source,
          to: "external",
          amount: input.amount,
          outletId: event.outletId ?? garage.profile.outlet.id,
          sourceType: "event_expense",
          sourceId: row.id,
          sourceRef: `${event.title} · ${line.title} · ${input.payee}`,
          actorUserId: garage.user.id,
          approverUserId: garage.user.id,
          note: input.reference?.trim() || null,
          occurredAt: paidAt,
          idempotencyKey: `event_expense:${row.id}`,
        });
      }
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EventFinanceError("DUPLICATE_REQUEST", "Pembayaran ini sudah tercatat.", 409);
    throw error;
  }
  await audit(garage, "Bayar biaya event", line.title, {
    eventId: event.id,
    lineId: line.id,
    paymentId: payment.id,
    amount: payment.amount,
    source: payment.source,
    payee: payment.payee,
  });
  return { payment, replay: false };
}

export async function voidExpensePayment(paymentId: string, reason: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  if (!reason || reason.trim().length < 3) throw new EventFinanceError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");
  const db = getDb();
  const [payment] = await db.select().from(eventExpensePayments).where(eq(eventExpensePayments.id, paymentId)).limit(1);
  if (!payment) throw new EventFinanceError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  if (payment.status === "void") throw new EventFinanceError("ALREADY_VOID", "Pembayaran ini sudah dibatalkan.", 409);
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(eventExpensePayments)
      .set({ status: "void", voidReason: reason.trim(), voidedBy: garage.user.id, voidedAt: new Date() })
      .where(and(eq(eventExpensePayments.id, paymentId), eq(eventExpensePayments.status, "posted")))
      .returning({ id: eventExpensePayments.id });
    if (!changed.length) throw new EventFinanceError("ALREADY_VOID", "Pembayaran ini sudah dibatalkan.", 409);
    // Buku kas tidak pernah diubah: baris pembalik external → rekening asal.
    const [posted] = await tx
      .select()
      .from(cashLedgerEntries)
      .where(and(eq(cashLedgerEntries.sourceType, "event_expense"), eq(cashLedgerEntries.sourceId, paymentId)))
      .limit(1);
    if (posted) {
      const [already] = await tx.select({ id: cashLedgerEntries.id }).from(cashLedgerEntries).where(eq(cashLedgerEntries.reversesId, posted.id)).limit(1);
      if (!already) {
        await postAccountCash(tx, {
          from: "external",
          to: payment.source as "bank_jago" | "bank_bni",
          amount: posted.amount,
          outletId: posted.outletId,
          sourceType: "event_expense_void",
          sourceId: paymentId,
          sourceRef: posted.sourceRef,
          reversesId: posted.id,
          actorUserId: garage.user.id,
          approverUserId: garage.user.id,
          note: reason.trim(),
          idempotencyKey: `event_expense_void:${paymentId}`,
        });
      }
    }
  });
  await audit(garage, "Batalkan biaya event", paymentId, { eventId: payment.eventId, paymentId, amount: payment.amount, reason: reason.trim() });
  return { id: paymentId, status: "void" as const };
}

export async function expenseProofPath(paymentId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const [row] = await getDb()
    .select({ id: eventExpensePayments.id, proofPath: eventExpensePayments.proofPath })
    .from(eventExpensePayments)
    .where(eq(eventExpensePayments.id, paymentId))
    .limit(1);
  if (!row) throw new EventFinanceError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
  return row;
}

export async function setExpenseProof(paymentId: string, proofPath: string, garage: GarageSession) {
  await expenseProofPath(paymentId, garage);
  await getDb().update(eventExpensePayments).set({ proofPath }).where(eq(eventExpensePayments.id, paymentId));
  await audit(garage, "Unggah bukti biaya event", paymentId, { paymentId });
  return { id: paymentId, hasProof: true };
}

// ─── Evaluasi pasca-event & perbandingan (GIGS EO #15) ─────────────────────

export const eventReviewSchema = z.object({
  eventId: z.string().uuid(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  highlights: optionalText(2000),
  issues: optionalText(2000),
  incidents: optionalText(2000),
  nextTime: optionalText(2000),
});

export async function saveEventReview(input: z.infer<typeof eventReviewSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const event = await loadEvent(input.eventId);
  const values = {
    eventId: event.id,
    rating: input.rating ?? null,
    highlights: input.highlights?.trim() || null,
    issues: input.issues?.trim() || null,
    incidents: input.incidents?.trim() || null,
    nextTime: input.nextTime?.trim() || null,
    updatedBy: garage.user.id,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(eventReviews)
    .values(values)
    .onConflictDoUpdate({ target: eventReviews.eventId, set: values })
    .returning();
  await audit(garage, "Simpan evaluasi event", event.title, { eventId: event.id, rating: row.rating });
  return row;
}

/**
 * Banding antar event (master, terbaru dulu): biaya dibayar, sponsor masuk, orang check-in. Penjualan menu tidak
 * ikut di daftar ini (butuh laporan per event); lihat detail tiap event.
 */
async function eventComparison(currentId: string) {
  const db = getDb();
  const rows = await db.execute(sql`
    select e.id, e.title, e.starts_at,
      coalesce((select sum(p.amount) from event_expense_payments p where p.event_id = e.id and p.status = 'posted'), 0)::bigint as cost_paid,
      coalesce((select sum(sp.amount) from event_sponsor_payments sp join event_sponsors s on s.id = sp.sponsor_id where s.event_id = e.id and sp.status = 'posted'), 0)::bigint as sponsor_paid,
      coalesce((select sum(c.pax) from event_checkins c where c.event_id = e.id and c.status = 'aktif'), 0)::int as checkins,
      (select r.rating from event_reviews r where r.event_id = e.id) as rating
    from events e
    where e.status <> 'archived'
    order by e.starts_at desc
    limit 6`);
  const list = (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? (rows as unknown as Array<Record<string, unknown>>);
  return list.map((r) => {
    const costPaid = Number(r.cost_paid);
    const sponsorPaid = Number(r.sponsor_paid);
    return {
      id: String(r.id),
      title: String(r.title),
      date: wibDate(new Date(r.starts_at as string)),
      costPaid,
      sponsorPaid,
      net: sponsorPaid - costPaid,
      checkins: Number(r.checkins),
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
      current: String(r.id) === currentId,
    };
  });
}

export async function getEventReviewAndComparison(eventId: string, garage: GarageSession) {
  assertOwnerHuman(garage);
  const [review] = await getDb().select().from(eventReviews).where(eq(eventReviews.eventId, eventId)).limit(1);
  return {
    review: review
      ? { rating: review.rating, highlights: review.highlights, issues: review.issues, incidents: review.incidents, nextTime: review.nextTime, updatedAt: review.updatedAt.toISOString() }
      : null,
    comparison: await eventComparison(eventId),
  };
}
