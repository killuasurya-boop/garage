import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { cashLedgerEntries, eventBudgetLines, eventExpensePayments, eventPerformers, eventReviews, events, eventVendorContracts } from "@/db/schema";
import { postAccountCash } from "@/lib/cash-ledger";
import {
  budgetSummary,
  EVENT_COST_CATEGORIES,
  EVENT_COST_LABEL,
  EVENT_PAY_SOURCE_LABEL,
  EVENT_PAY_SOURCES,
  eventProfit,
  isReserveBudgetLine,
  platformBudgetCategory,
  type EventCostCategory,
  type EventPaySource,
} from "@/lib/event-finance-rules";
import { listMasterEvents } from "@/lib/event-master";
import { wibDate } from "@/lib/event-sponsor-rules";
import { createAuditLog } from "@/lib/garage-service";
import { fetchPlatformBudget } from "@/lib/gigs-promo";
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
    // Tidak ada komponen terjual = HPP 0. Ada komponen (walau diskon 100%) = pakai HPP snapshot apa adanya.
    const noSales = report.summary.componentUnits === 0;
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
    event: { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), status: event.status, platformSlug: event.platformSlug ?? null },
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
    contracts: await contractsOf(id, budget.rows, wibDate(now)),
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

export const importPlatformBudgetSchema = z.object({ eventId: z.string().uuid() });

/**
 * Impor RAB dari platform GIGS sebagai pos anggaran (Owner, sekali klik). Hanya RENCANA: tidak ada uang yang bergerak,
 * tidak ada baris buku kas. Nama pos yang sudah ada (aktif/arsip, tanpa peduli huruf) TIDAK ditimpa. Pos cadangan
 * ("Save Money", "bukan biaya") dilewati. Setelah impor semua pos bebas diubah/diarsipkan seperti biasa.
 */
export async function importPlatformBudget(input: z.infer<typeof importPlatformBudgetSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const event = await loadEvent(input.eventId);
  let platform: Awaited<ReturnType<typeof fetchPlatformBudget>>;
  try {
    platform = await fetchPlatformBudget({ slug: event.platformSlug ?? null, name: event.title });
  } catch {
    throw new EventFinanceError("PLATFORM_UNREACHABLE", "Platform GIGS tidak bisa dihubungi. Coba lagi beberapa saat.", 502);
  }
  if (!platform) {
    throw new EventFinanceError("PLATFORM_EVENT_NOT_FOUND", "Event ini tidak ditemukan di platform GIGS. Isi slug platform di menu Event, atau samakan judul event.", 404);
  }
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const existing = await tx.select({ title: eventBudgetLines.title }).from(eventBudgetLines).where(eq(eventBudgetLines.eventId, event.id)).for("update");
    const titles = new Set(existing.map((r) => r.title.trim().toLowerCase()));
    const created: Array<{ title: string; category: EventCostCategory; plannedAmount: number }> = [];
    const skipped: string[] = [];
    const reserve: Array<{ title: string; amount: number }> = [];
    for (const line of platform.lines) {
      const title = line.name.trim();
      if (isReserveBudgetLine(title, line.purpose)) {
        reserve.push({ title, amount: line.budget });
        continue;
      }
      if (titles.has(title.toLowerCase())) {
        skipped.push(title);
        continue;
      }
      const category = platformBudgetCategory(title);
      const notes = [`RAB platform GIGS${line.code ? ` #${line.code}` : ""}`, line.pic ? `PIC ${line.pic}` : null, line.purpose].filter(Boolean).join(" · ").slice(0, 500);
      await tx.insert(eventBudgetLines).values({ eventId: event.id, category, title, plannedAmount: line.budget, notes, createdBy: garage.user.id });
      titles.add(title.toLowerCase());
      created.push({ title, category, plannedAmount: line.budget });
    }
    return { created, skipped, reserve };
  });
  // Audit setelah transaksi (PGlite satu koneksi).
  await audit(garage, "Impor RAB dari platform GIGS", event.title, {
    eventId: event.id,
    platform: platform.slug,
    created: result.created,
    skipped: result.skipped,
    reserve: result.reserve,
  });
  return {
    platformName: platform.name,
    target: platform.target,
    createdTotal: result.created.reduce((sum, r) => sum + r.plannedAmount, 0),
    ...result,
  };
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

/**
 * Laba rugi memakai snapshot harian otomatis untuk hari > 7 hari lalu. Biaya bertanggal mundur harus menghapus snapshot
 * otomatis hari itu supaya dihitung ulang (snapshot locked Daily Closing tidak disentuh).
 */
async function invalidateEventCostDays(dates: Date[]) {
  const { businessDateOf } = await import("@/lib/cash-ledger");
  const { loadBusinessDayPolicy } = await import("@/lib/business-date-policy");
  const { invalidateAutoSnapshotDays } = await import("@/lib/finance-control");
  const policy = await loadBusinessDayPolicy(getDb());
  await invalidateAutoSnapshotDays(dates.map((d) => businessDateOf(d, policy)));
}

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
  await invalidateEventCostDays([payment.paidAt]);
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
  await invalidateEventCostDays([new Date()]);
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

// ─── Kontrak vendor (Owner 20 Nov 2026, pindahan Dashboard Penyelenggara) ───
// Kesepakatan dengan vendor per pos anggaran: nilai, syarat, tenggat, status aktif → selesai / batal (final).
// Tidak menggerakkan uang: "dibayar" = total pembayaran pos itu (buku kas / uang pribadi Owner) yang sudah ada.

export const contractSchema = z.object({
  budgetLineId: z.string().uuid(),
  vendor: z.string().trim().min(2, "Nama vendor wajib diisi.").max(120),
  pic: optionalText(80),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, "Nomor WA vendor tidak valid.")
    .nullable()
    .optional()
    .or(z.literal("")),
  // Kolom integer (sama dengan pos anggaran): maks. Rp2 miliar, supaya tidak gagal di database.
  value: rupiah.min(0).max(2_000_000_000, "Nilai kontrak maksimal Rp2.000.000.000."),
  terms: optionalText(1000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tenggat tidak valid.").nullable().optional().or(z.literal("")),
});
export const contractPatchSchema = contractSchema
  .omit({ budgetLineId: true })
  .partial()
  .extend({
    status: z.enum(["aktif", "selesai", "batal"]).optional(),
    doneNote: optionalText(300),
    cancelReason: optionalText(300),
  });

async function contractsOf(eventId: string, rows: Array<{ id: string; title: string; paid: number }>, today: string) {
  const list = await getDb().select().from(eventVendorContracts).where(eq(eventVendorContracts.eventId, eventId)).orderBy(asc(eventVendorContracts.createdAt));
  const lineById = new Map(rows.map((r) => [r.id, r]));
  return list.map((c) => {
    const line = lineById.get(c.budgetLineId);
    const due = c.dueDate ? String(c.dueDate) : null;
    return {
      id: c.id,
      budgetLineId: c.budgetLineId,
      lineTitle: line?.title ?? "-",
      linePaid: line?.paid ?? 0,
      vendor: c.vendor,
      pic: c.pic,
      phone: c.phone,
      value: c.value,
      terms: c.terms,
      dueDate: due,
      status: c.status as "aktif" | "selesai" | "batal",
      overdue: c.status === "aktif" && Boolean(due && due < today),
      doneNote: c.doneNote,
      cancelReason: c.cancelReason,
    };
  });
}

export async function createVendorContract(input: z.infer<typeof contractSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [line] = await db.select().from(eventBudgetLines).where(eq(eventBudgetLines.id, input.budgetLineId)).limit(1);
  if (!line) throw new EventFinanceError("LINE_NOT_FOUND", "Pos anggaran tidak ditemukan.", 404);
  if (line.status !== "aktif") throw new EventFinanceError("LINE_ARCHIVED", "Pos anggaran sudah diarsip.", 409);
  const [row] = await db
    .insert(eventVendorContracts)
    .values({
      eventId: line.eventId,
      budgetLineId: line.id,
      vendor: input.vendor,
      pic: input.pic?.trim() || null,
      phone: input.phone?.trim() || null,
      value: input.value,
      terms: input.terms?.trim() || null,
      dueDate: input.dueDate || null,
      createdBy: garage.user.id,
    })
    .returning();
  await audit(garage, "Tambah kontrak vendor event", `${row.vendor} · ${line.title}`, { eventId: line.eventId, contractId: row.id, value: row.value });
  return { id: row.id };
}

export async function updateVendorContract(id: string, patch: z.infer<typeof contractPatchSchema>, garage: GarageSession) {
  assertOwnerHuman(garage);
  const db = getDb();
  const [before] = await db.select().from(eventVendorContracts).where(eq(eventVendorContracts.id, id)).limit(1);
  if (!before) throw new EventFinanceError("NOT_FOUND", "Kontrak tidak ditemukan.", 404);
  if (before.status !== "aktif") throw new EventFinanceError("CONTRACT_CLOSED", "Kontrak yang sudah selesai/batal tidak bisa diubah.", 409);
  const values: Partial<typeof eventVendorContracts.$inferInsert> = { updatedAt: new Date() };
  if (patch.vendor !== undefined) values.vendor = patch.vendor;
  if (patch.pic !== undefined) values.pic = patch.pic?.trim() || null;
  if (patch.phone !== undefined) values.phone = patch.phone?.trim() || null;
  if (patch.value !== undefined) values.value = patch.value;
  if (patch.terms !== undefined) values.terms = patch.terms?.trim() || null;
  if (patch.dueDate !== undefined) values.dueDate = patch.dueDate || null;
  if (patch.status === "batal") {
    const reason = patch.cancelReason?.trim();
    if (!reason) throw new EventFinanceError("CANCEL_REASON_REQUIRED", "Alasan pembatalan kontrak wajib diisi.");
    values.status = "batal";
    values.cancelReason = reason;
  } else if (patch.status === "selesai") {
    values.status = "selesai";
    values.doneNote = patch.doneNote?.trim() || null;
  }
  // Tidak menimpa perubahan status orang lain (dua layar bersamaan): hanya baris yang masih aktif.
  const [row] = await db
    .update(eventVendorContracts)
    .set(values)
    .where(and(eq(eventVendorContracts.id, id), eq(eventVendorContracts.status, "aktif")))
    .returning();
  if (!row) throw new EventFinanceError("CONTRACT_CLOSED", "Kontrak ini baru saja ditutup. Muat ulang.", 409);
  const changed = Object.keys(values).filter((k) => k !== "updatedAt");
  await audit(garage, values.status === "batal" ? "Batalkan kontrak vendor event" : values.status === "selesai" ? "Kontrak vendor event selesai" : "Ubah kontrak vendor event", row.vendor, {
    eventId: row.eventId,
    contractId: id,
    before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (row as Record<string, unknown>)[k]])),
  });
  return { id, status: row.status };
}
