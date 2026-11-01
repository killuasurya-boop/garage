// =============================================================================
// Production Hub V4 — antrean tiket SELESAI di tabel `print_jobs` yang sudah ada
// (tanpa migrasi). Aturan & format: production-completion-print-rules.ts.
//
// Server tidak bisa menyentuh printer warung (VPS). Server hanya menyimpan job
// secara durable; perangkat Bar/Dapur/kasir dengan "Auto Print" mengklaim job,
// mencetak lewat layanan printer perangkat (print-client.ts), lalu melapor hasil.
// Setiap langkah (antre, klaim, hasil, ulang, cetak ulang) tercatat di audit_logs.
// =============================================================================

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { kitchenTickets, orders, printJobs, productionTicketItems } from "@/db/schema";
import { normalizeProductionStation, productionItemLabel } from "@/lib/garage-production-rules";
import {
  COMPLETION_CLAIM_LEASE_MS,
  COMPLETION_JOB_TYPE,
  COMPLETION_JOB_TYPES,
  COMPLETION_REPRINT_JOB_TYPE,
  COMPLETION_TARGET,
  isOrderProductionComplete,
  reprintAllowed,
  statusAfterDefiniteFailure,
  type CompletionPrintStatus,
  type CompletionPrintView,
  type CompletionTicketItem,
  type CompletionTicketPayload,
} from "@/lib/production-completion-print-rules";
import { publishProductionChange } from "@/lib/production-events";
import type { GarageSession } from "@/lib/server-auth";

/** Penanda error untuk klaim yang kedaluwarsa (mungkin sudah tercetak). */
export const UNCERTAIN_PRINT_ERROR =
  "Status cetak tidak pasti (perangkat tidak melapor). Cek kertas, lalu Cetak ulang bila belum keluar.";

const LIST_WINDOW_MS = 12 * 60 * 60_000;

export class CompletionPrintError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "INVALID" | "LIMIT",
  ) {
    super(message);
    this.name = "CompletionPrintError";
  }
}


type PrintJobRow = typeof printJobs.$inferSelect;
type ClaimInfo = { token: string; device: string; byName: string; at: string };

function actorOf(garage: GarageSession) {
  return `${garage.user.name} / ${garage.profile.role}`;
}

async function audit(
  garage: GarageSession | null,
  action: string,
  job: Pick<PrintJobRow, "id" | "ticketNo" | "orderId" | "jobType">,
  status: string,
  metadata: Record<string, unknown> = {},
) {
  const { createAuditLog } = await import("@/lib/garage-service");
  await createAuditLog({
    actor: garage ? actorOf(garage) : "Sistem",
    action,
    object: job.ticketNo ?? job.orderId ?? job.id,
    device: garage?.profile.deviceLabel ?? "server",
    status,
    metadata: { module: "production-completion-print", printJobId: job.id, jobType: job.jobType, ...metadata },
  });
}

function toView(row: PrintJobRow): CompletionPrintView {
  const payload = row.payload as unknown as CompletionTicketPayload & { claim?: ClaimInfo };
  const { claim, ...ticket } = payload;
  return {
    id: row.id,
    jobType: row.jobType,
    reprint: row.jobType === COMPLETION_REPRINT_JOB_TYPE,
    orderId: row.orderId,
    orderNo: row.ticketNo,
    tableLabel: ticket.tableLabel ?? null,
    status: (row.status as CompletionPrintStatus) ?? "pending",
    attempts: row.attempts,
    error: row.error,
    printedAt: row.printedAt?.toISOString() ?? null,
    claimedBy: claim?.device ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    payload: ticket as CompletionTicketPayload,
  };
}

async function buildPayload(orderId: string): Promise<CompletionTicketPayload | null> {
  const db = getDb();
  const [order] = await db
    .select({ id: orders.id, orderNo: orders.orderNo, queueNo: orders.queueNo, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return null;
  const tickets = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.orderId, orderId))
    .orderBy(asc(kitchenTickets.createdAt));
  if (!isOrderProductionComplete(tickets.map((t) => t.status))) return null;
  const live = tickets.filter((t) => !["rejected", "canceled", "cancelled"].includes(t.status));
  const itemRows = await db
    .select()
    .from(productionTicketItems)
    .where(
      inArray(
        productionTicketItems.ticketId,
        live.map((t) => t.id),
      ),
    )
    .orderBy(asc(productionTicketItems.createdAt));
  const stationOf = (raw: string): "Bar" | "Dapur" => (normalizeProductionStation(raw) === "Bar" ? "Bar" : "Dapur");
  const items: CompletionTicketItem[] = [];
  for (const ticket of live) {
    const own = itemRows.filter((item) => item.ticketId === ticket.id && item.status !== "cancelled");
    if (own.length) {
      for (const item of own) {
        items.push({
          station: stationOf(ticket.station),
          label: productionItemLabel(item.itemName, item.variantLabel),
          qty: item.qty,
          note: item.note?.trim() || null,
        });
      }
    } else {
      // Tiket lama tanpa porsi terstruktur: "2x Latte".
      for (const raw of ticket.items) {
        const match = raw.match(/^\s*(\d+)\s*x\s+(.*)$/i);
        items.push({
          station: stationOf(ticket.station),
          label: match ? match[2].trim() : raw.trim(),
          qty: match ? Number(match[1]) || 1 : 1,
          note: null,
        });
      }
    }
  }
  const lastReady = Math.max(0, ...live.map((t) => t.readyAt?.getTime() ?? 0));
  const first = live[0];
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    queueNo: order.queueNo ?? null,
    tableLabel: first?.tableLabel ?? "-",
    channel: first?.channel ?? "",
    customerName: live.find((t) => t.customerName?.trim())?.customerName ?? null,
    orderedAt: order.createdAt.toISOString(),
    completedAt: new Date(lastReady || Date.now()).toISOString(),
    items,
    stations: live.map((t) => ({
      station: stationOf(t.station),
      readyAt: t.readyAt?.toISOString() ?? null,
      readyByName: t.readyByName ?? null,
    })),
    reprint: null,
  };
}

/**
 * Antrekan tiket SELESAI bila semua tiket order sudah READY/diantar. Idempoten:
 * dipanggil berulang (dua station selesai bersamaan, retry request, reopen lalu
 * READY lagi) tetap satu job per order.
 */
export async function enqueueOrderCompletionPrint(
  orderId: string,
  garage: GarageSession | null,
): Promise<{ created: boolean; jobId: string } | null> {
  const payload = await buildPayload(orderId);
  if (!payload) return null;
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage:completion-print:${orderId}`}))`);
    const [existing] = await tx
      .select({ id: printJobs.id })
      .from(printJobs)
      .where(and(eq(printJobs.orderId, orderId), eq(printJobs.jobType, COMPLETION_JOB_TYPE)))
      .limit(1);
    if (existing) return { created: false, row: null as PrintJobRow | null, jobId: existing.id };
    const [row] = await tx
      .insert(printJobs)
      .values({
        jobType: COMPLETION_JOB_TYPE,
        target: COMPLETION_TARGET,
        status: "pending",
        orderId,
        ticketNo: payload.orderNo,
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning();
    return { created: true, row, jobId: row.id };
  });
  if (result.created && result.row) {
    await audit(garage, "Completion ticket queued", result.row, "pending", {
      orderNo: payload.orderNo,
      tableLabel: payload.tableLabel,
      itemCount: payload.items.length,
    });
    publishProductionChange();
  }
  return { created: result.created, jobId: result.jobId };
}

/** Klaim yang kedaluwarsa → failed "tidak pasti" (tidak dicetak ulang otomatis). */
async function expireStaleClaims(outletId: string, now: Date) {
  const rows = await getDb()
    .update(printJobs)
    .set({ status: "failed", error: UNCERTAIN_PRINT_ERROR, updatedAt: now })
    .where(
      and(
        inArray(printJobs.jobType, [...COMPLETION_JOB_TYPES]),
        eq(printJobs.status, "printing"),
        lt(printJobs.updatedAt, new Date(now.getTime() - COMPLETION_CLAIM_LEASE_MS)),
        inArray(printJobs.orderId, outletOrderIdsQuery(outletId)),
      ),
    )
    .returning();
  for (const row of rows) {
    await audit(null, "Completion ticket print uncertain", row, "failed", { reason: "claim_expired" });
  }
  return rows.length;
}

function outletOrderIdsQuery(outletId: string) {
  return getDb().select({ id: orders.id }).from(orders).where(eq(orders.outletId, outletId));
}

export async function listCompletionPrints(garage: GarageSession, now = new Date()): Promise<CompletionPrintView[]> {
  await expireStaleClaims(garage.profile.outlet.id, now);
  const rows = await getDb()
    .select()
    .from(printJobs)
    .where(
      and(
        inArray(printJobs.jobType, [...COMPLETION_JOB_TYPES]),
        gte(printJobs.createdAt, new Date(now.getTime() - LIST_WINDOW_MS)),
        inArray(printJobs.orderId, outletOrderIdsQuery(garage.profile.outlet.id)),
      ),
    )
    .orderBy(desc(printJobs.createdAt))
    .limit(80);
  return rows.map(toView);
}

async function loadOwnJob(id: string, garage: GarageSession) {
  const db = getDb();
  const [row] = await db
    .select({ job: printJobs, outletId: orders.outletId })
    .from(printJobs)
    .leftJoin(orders, eq(orders.id, printJobs.orderId))
    .where(and(eq(printJobs.id, id), inArray(printJobs.jobType, [...COMPLETION_JOB_TYPES])))
    .limit(1);
  if (!row) throw new CompletionPrintError("Job cetak tidak ditemukan.", "NOT_FOUND");
  if (row.outletId !== garage.profile.outlet.id) {
    throw new CompletionPrintError("Job cetak milik outlet lain.", "FORBIDDEN");
  }
  return row.job;
}

/** Perangkat mengklaim job pending (atomik). Gagal = sudah diklaim perangkat lain. */
export async function claimCompletionPrint(id: string, device: string, garage: GarageSession) {
  await loadOwnJob(id, garage);
  const now = new Date();
  const claim: ClaimInfo = { token: randomUUID(), device, byName: garage.user.name, at: now.toISOString() };
  const [row] = await getDb()
    .update(printJobs)
    .set({
      status: "printing",
      updatedAt: now,
      payload: sql`${printJobs.payload} || ${JSON.stringify({ claim })}::jsonb`,
    })
    .where(and(eq(printJobs.id, id), eq(printJobs.status, "pending")))
    .returning();
  if (!row) {
    throw new CompletionPrintError("Job sudah diambil perangkat lain atau tidak lagi menunggu cetak.", "CONFLICT");
  }
  await audit(garage, "Completion ticket print claimed", row, "printing", { device, attempt: row.attempts + 1 });
  return { job: toView(row), token: claim.token };
}

/** Laporan hasil cetak dari perangkat pemegang klaim. */
export async function reportCompletionPrint(
  id: string,
  input: { token: string; ok: boolean; error?: string | null; printer?: string | null },
  garage: GarageSession,
) {
  const current = await loadOwnJob(id, garage);
  const claim = (current.payload as { claim?: ClaimInfo }).claim;
  const uncertain = current.status === "failed" && current.error === UNCERTAIN_PRINT_ERROR;
  if (!claim || claim.token !== input.token || (current.status !== "printing" && !uncertain)) {
    throw new CompletionPrintError("Klaim cetak tidak berlaku lagi.", "CONFLICT");
  }
  const now = new Date();
  const attemptsAfter = current.attempts + 1;
  const status: CompletionPrintStatus = input.ok ? "printed" : statusAfterDefiniteFailure(attemptsAfter);
  const error = input.ok ? null : (input.error?.trim() || "Printer gagal mencetak.").slice(0, 240);
  const [row] = await getDb()
    .update(printJobs)
    .set({ status, attempts: attemptsAfter, error, printedAt: input.ok ? now : null, updatedAt: now })
    .where(and(eq(printJobs.id, id), eq(printJobs.status, current.status), eq(printJobs.attempts, current.attempts)))
    .returning();
  if (!row) throw new CompletionPrintError("Job berubah bersamaan — muat ulang.", "CONFLICT");
  await audit(garage, input.ok ? "Completion ticket printed" : "Completion ticket print failed", row, status, {
    device: claim.device,
    attempt: attemptsAfter,
    printer: input.printer ?? null,
    error,
  });
  publishProductionChange();
  return toView(row);
}

/** Staf mengantrekan ulang job GAGAL (setelah printer dibereskan). */
export async function retryCompletionPrint(id: string, garage: GarageSession) {
  const current = await loadOwnJob(id, garage);
  if (current.status !== "failed") {
    throw new CompletionPrintError("Hanya job yang gagal yang bisa diantrekan ulang.", "INVALID");
  }
  const [row] = await getDb()
    .update(printJobs)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(printJobs.id, id), eq(printJobs.status, "failed")))
    .returning();
  if (!row) throw new CompletionPrintError("Job berubah bersamaan — muat ulang.", "CONFLICT");
  await audit(garage, "Completion ticket print retried", row, "pending", { previousError: current.error });
  publishProductionChange();
  return toView(row);
}

/**
 * Cetak ulang terkendali: job baru bertanda "CETAK ULANG KE-n" + alasan. Kasir/
 * produksi dibatasi (COMPLETION_STAFF_REPRINT_LIMIT), Owner/Manajer bebas; semua
 * diaudit. Satu cetak ulang aktif per order (tidak dobel saat tombol ditekan 2x).
 */
export async function reprintOrderCompletion(orderId: string, reason: string, garage: GarageSession) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new CompletionPrintError("Alasan cetak ulang wajib diisi.", "INVALID");
  const db = getDb();
  const [order] = await db
    .select({ outletId: orders.outletId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new CompletionPrintError("Order tidak ditemukan.", "NOT_FOUND");
  if (order.outletId !== garage.profile.outlet.id) {
    throw new CompletionPrintError("Order milik outlet lain.", "FORBIDDEN");
  }
  const base = await buildPayload(orderId);
  if (!base) throw new CompletionPrintError("Order belum selesai diproduksi.", "INVALID");

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage:completion-print:${orderId}`}))`);
    const jobs = await tx
      .select({ jobType: printJobs.jobType, status: printJobs.status })
      .from(printJobs)
      .where(and(eq(printJobs.orderId, orderId), inArray(printJobs.jobType, [...COMPLETION_JOB_TYPES])));
    if (jobs.some((j) => j.status === "pending" || j.status === "printing")) {
      throw new CompletionPrintError("Masih ada cetakan order ini di antrean — tunggu selesai.", "CONFLICT");
    }
    const reprints = jobs.filter((j) => j.jobType === COMPLETION_REPRINT_JOB_TYPE).length;
    const allowed = reprintAllowed(garage.profile.role, reprints);
    if (!allowed.ok) throw new CompletionPrintError(allowed.message, "LIMIT");
    const payload: CompletionTicketPayload = {
      ...base,
      reprint: { sequence: reprints + 1, reason: trimmed.slice(0, 120), byName: garage.user.name },
    };
    const [inserted] = await tx
      .insert(printJobs)
      .values({
        jobType: COMPLETION_REPRINT_JOB_TYPE,
        target: COMPLETION_TARGET,
        status: "pending",
        orderId,
        ticketNo: base.orderNo,
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning();
    return inserted;
  });
  await audit(garage, "Completion ticket reprint requested", row, "pending", {
    reason: trimmed,
    sequence: (row.payload as unknown as CompletionTicketPayload).reprint?.sequence ?? null,
  });
  publishProductionChange();
  return toView(row);
}

/** Riwayat cetak SELESAI untuk beberapa order (drawer Riwayat). */
export async function completionPrintsForOrders(orderIds: string[]) {
  if (!orderIds.length) return [];
  const rows = await getDb()
    .select()
    .from(printJobs)
    .where(
      and(
        inArray(printJobs.orderId, orderIds),
        or(...COMPLETION_JOB_TYPES.map((type) => eq(printJobs.jobType, type))),
      ),
    )
    .orderBy(asc(printJobs.createdAt));
  return rows.map(toView);
}
