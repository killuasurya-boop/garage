// =============================================================================
// PRODUCTION HUB — engine server: papan produksi, Smart Batch, Allocation.
// Acuan: GARAGE OS Production Hub v1.0 §6–§10, Workflow Operasional §8–§11.
//
// Prinsip: batch menggabung PEKERJAAN, tidak pernah menggabung identitas.
// Setiap porsi tetap membawa Nama + Meja + Order ID sampai diantar.
// =============================================================================

import { and, asc, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  approvals,
  kitchenTickets,
  orders,
  productionBatchAllocations,
  productionBatches,
  productionTicketItems,
} from "@/db/schema";
import type {
  ProductionBatchView,
  ProductionBoard,
  ProductionStationLoad,
  ProductionTicketView,
} from "@/lib/garage-api-types";
import {
  allocationCoverage,
  batchKeyFor,
  buildBatchSuggestions,
  canHandoverStation,
  canOperateStation,
  normalizeProductionStation,
  productionIdentityName,
  productionItemLabel,
  productionStationLabel,
  type BatchCandidateItem,
} from "@/lib/garage-production-rules";
import { fullyReadyTicketIds, ticketNosByIds } from "@/lib/garage-production-tickets";
import {
  createAuditLog,
  getAppSettings,
  handoverKitchenTicket,
  pickupKitchenTicket,
  serveTicketDirect,
  KitchenTransitionError,
  listCallableWaiters,
  ProductionPermissionError,
  roleDisplayName,
  updateKitchenStatus,
} from "@/lib/garage-service";
import { listCompletionPrints } from "@/lib/production-completion-print";
import { normalizeSlaConfig } from "@/lib/production-sla";
import { notifyingProduction, publishProductionChange } from "@/lib/production-events";
import type { GarageSession } from "@/lib/server-auth";

const ACTIVE_TICKET_STATUSES = ["queue", "cooking", "ready"];
// Tiket batal (order di-void) tetap tampil sebentar sebagai tanda "hentikan".
const CANCELLED_VISIBLE_MS = 15 * 60 * 1000;

export class ProductionBatchError extends Error {
  constructor(
    message: string,
    public readonly code: "BATCH_INVALID" | "BATCH_NOT_FOUND" | "UNALLOCATED" | "BATCH_CONFLICT",
    public readonly unallocatedQty = 0,
  ) {
    super(message);
    this.name = "ProductionBatchError";
  }
}

function actorLabel(garage: GarageSession) {
  return `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
}

function jakartaDayStart(now = new Date()) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { key, start: new Date(`${key}T00:00:00+07:00`) };
}

function minutesSince(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));
}

function legacyItemParts(raw: string) {
  const match = raw.match(/^\s*(\d+)\s*x\s+(.*)$/i);
  if (!match) return { qty: 1, label: raw.trim() };
  return { qty: Number(match[1]) || 1, label: match[2].trim() };
}

// ---------------------------------------------------------------------------
// Papan produksi
// ---------------------------------------------------------------------------

export async function getProductionBoard(garage: GarageSession): Promise<ProductionBoard> {
  // getAppSettings sebelum query lain (PGlite satu koneksi — jangan di dalam tx).
  const settings = await getAppSettings(garage.profile.outlet.id);
  const db = getDb();
  const now = new Date();

  // Tiket SIAP yang tak pernah diambil (takeaway/tanpa waiter) jangan menumpuk
  // sampai menutupi pesanan baru: ambil yang terbaru, SIAP > 8 jam disembunyikan,
  // dan hanya tiket outlet akun ini.
  const staleReadyBefore = new Date(now.getTime() - 8 * 60 * 60_000);
  const ticketRows = (
    await db
      .select()
      .from(kitchenTickets)
      .where(
        and(
          inArray(kitchenTickets.status, ACTIVE_TICKET_STATUSES),
          or(ne(kitchenTickets.status, "ready"), gte(kitchenTickets.updatedAt, staleReadyBefore)),
          or(
            isNull(kitchenTickets.orderId),
            inArray(
              kitchenTickets.orderId,
              db.select({ id: orders.id }).from(orders).where(eq(orders.outletId, garage.profile.outlet.id)),
            ),
          ),
        ),
      )
      .orderBy(desc(kitchenTickets.createdAt))
      .limit(300)
  ).reverse();
  const ticketIds = ticketRows.map((row) => row.id);

  const itemRows = ticketIds.length
    ? await db
        .select()
        .from(productionTicketItems)
        .where(inArray(productionTicketItems.ticketId, ticketIds))
        .orderBy(asc(productionTicketItems.createdAt))
    : [];

  const batchRows = await db
    .select()
    .from(productionBatches)
    .where(
      and(
        eq(productionBatches.status, "processing"),
        // Audit P1: batch outlet lain dulu ikut tampil (multi-outlet). Batch lama tanpa outlet tetap tampil.
        or(eq(productionBatches.outletId, garage.profile.outlet.id), isNull(productionBatches.outletId)),
      ),
    )
    .orderBy(asc(productionBatches.startedAt));
  const batchIds = batchRows.map((row) => row.id);
  const allocationRows = batchIds.length
    ? await db
        .select()
        .from(productionBatchAllocations)
        .where(inArray(productionBatchAllocations.batchId, batchIds))
        .orderBy(asc(productionBatchAllocations.createdAt))
    : [];

  const orderIds = [
    ...new Set(ticketRows.map((row) => row.orderId).filter((id): id is string => Boolean(id))),
  ];
  const queueByOrder = new Map<string, number | null>();
  if (orderIds.length) {
    const orderRows = await db
      .select({ id: orders.id, queueNo: orders.queueNo })
      .from(orders)
      .where(inArray(orders.id, orderIds));
    for (const row of orderRows) queueByOrder.set(row.id, row.queueNo);
  }

  // Pengajuan batal yang menunggu persetujuan (APP-VOID / APP-RFD / APP-PCX) per order.
  const pendingCancelByOrder = new Map<string, { approvalId: string; kind: "order" | "items"; summary: string }>();
  if (orderIds.length) {
    const pendingRows = await db
      .select({ id: approvals.id, reason: approvals.reason, payload: approvals.payload })
      .from(approvals)
      .where(
        and(
          eq(approvals.status, "pending"),
          or(ilike(approvals.id, "APP-VOID-%"), ilike(approvals.id, "APP-RFD-%"), ilike(approvals.id, "APP-PCX-%")),
        ),
      )
      .limit(200);
    for (const row of pendingRows) {
      const payloadOrderId = (row.payload as { orderId?: string } | null)?.orderId;
      const orderId = payloadOrderId ?? orderIds.find((id) => row.id.startsWith(`APP-VOID-${id}`));
      if (!orderId || !orderIds.includes(orderId)) continue;
      pendingCancelByOrder.set(orderId, {
        approvalId: row.id,
        kind: row.id.startsWith("APP-VOID-") ? "order" : "items",
        summary: row.reason,
      });
    }
  }

  const cancelledRows = await db
    .select()
    .from(kitchenTickets)
    .where(
      and(
        eq(kitchenTickets.status, "cancelled"),
        gte(kitchenTickets.issueAt, new Date(now.getTime() - CANCELLED_VISIBLE_MS)),
        or(
          isNull(kitchenTickets.orderId),
          inArray(
            kitchenTickets.orderId,
            db.select({ id: orders.id }).from(orders).where(eq(orders.outletId, garage.profile.outlet.id)),
          ),
        ),
      ),
    )
    .orderBy(desc(kitchenTickets.issueAt))
    .limit(20);

  const { start: dayStart } = jakartaDayStart(now);
  const doneToday = await db
    .select({
      station: kitchenTickets.station,
      acceptedAt: kitchenTickets.acceptedAt,
      createdAt: kitchenTickets.createdAt,
      readyAt: kitchenTickets.readyAt,
    })
    .from(kitchenTickets)
    .where(gte(kitchenTickets.readyAt, dayStart))
    .limit(1000);

  const batchById = new Map(batchRows.map((row) => [row.id, row]));
  const itemsByTicket = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    itemsByTicket.set(item.ticketId, [...(itemsByTicket.get(item.ticketId) ?? []), item]);
  }
  const ticketById = new Map(ticketRows.map((row) => [row.id, row]));

  // Urutan add-on per meja (order ke-2+ di meja yang sama saat ini aktif).
  const addonByOrder = new Map<string, number>();
  const ordersByTable = new Map<string, string[]>();
  for (const row of ticketRows) {
    if (!row.orderId) continue;
    const list = ordersByTable.get(row.tableLabel) ?? [];
    if (!list.includes(row.orderId)) list.push(row.orderId);
    ordersByTable.set(row.tableLabel, list);
  }
  for (const list of ordersByTable.values()) {
    list.forEach((orderId, index) => addonByOrder.set(orderId, index + 1));
  }

  const identityFor = (ticket: (typeof ticketRows)[number]) =>
    productionIdentityName(
      ticket.customerName,
      ticket.orderId ? queueByOrder.get(ticket.orderId) ?? null : null,
    );

  const tickets: ProductionTicketView[] = ticketRows.map((ticket) => {
    const allItems = itemsByTicket.get(ticket.id) ?? [];
    // Porsi yang dibatalkan (void bill split / refund parsial) tidak ditampilkan.
    const items = allItems.filter((item) => item.status !== "cancelled");
    const legacy = allItems.length === 0;
    const notes = (ticket.itemNotes ?? {}) as Record<string, unknown>;
    const pendingBatchNos = [
      ...new Set(
        items
          .filter((item) => item.batchId && item.status !== "ready" && batchById.has(item.batchId))
          .map((item) => batchById.get(item.batchId as string)?.batchNo ?? ""),
      ),
    ].filter(Boolean);
    return {
      ticketNo: ticket.ticketNo,
      orderId: ticket.orderId,
      orderNo: ticket.orderNo,
      queueNo: ticket.orderId ? queueByOrder.get(ticket.orderId) ?? null : null,
      customerName: ticket.customerName,
      identity: identityFor(ticket),
      table: ticket.tableLabel,
      channel: ticket.channel,
      station: normalizeProductionStation(ticket.station),
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      acceptedAt: ticket.acceptedAt?.toISOString() ?? null,
      readyAt: ticket.readyAt?.toISOString() ?? null,
      targetMinutes: ticket.targetMinutes,
      claimedByName: ticket.claimedByName ?? null,
      handoverAt: ticket.handoverAt?.toISOString() ?? null,
      handoverByName: ticket.handoverByName ?? null,
      issueReason: ticket.issueReason ?? null,
      addonSequence: ticket.orderId ? addonByOrder.get(ticket.orderId) ?? 1 : 1,
      chitPrintedAt: ticket.chitPrintedAt?.toISOString() ?? null,
      pendingCancel: ticket.orderId ? pendingCancelByOrder.get(ticket.orderId) ?? null : null,
      legacy,
      pendingBatchNos,
      items: legacy
        ? ticket.items.map((raw, index) => {
            const parts = legacyItemParts(raw);
            const note = notes[raw];
            return {
              id: `${ticket.ticketNo}-${index}`,
              label: parts.label,
              qty: parts.qty,
              note: typeof note === "string" && note.trim() ? note.trim() : null,
              status: ticket.status === "ready" ? "ready" : ticket.status === "cooking" ? "processing" : "waiting",
              batchId: null,
              batchNo: null,
            };
          })
        : items.map((item) => ({
            id: item.id,
            label: productionItemLabel(item.itemName, item.variantLabel),
            qty: item.qty,
            note: item.note,
            status: item.status,
            batchId: item.batchId,
            batchNo: item.batchId ? batchById.get(item.batchId)?.batchNo ?? null : null,
          })),
    };
  });

  const batches: ProductionBatchView[] = batchRows.map((batch) => ({
    id: batch.id,
    batchNo: batch.batchNo,
    station: normalizeProductionStation(batch.station),
    itemLabel: batch.itemLabel,
    menuItemId: batch.menuItemId,
    variantId: batch.variantId,
    note: batch.note,
    totalQty: batch.totalQty,
    status: batch.status,
    startedAt: batch.startedAt.toISOString(),
    startedByName: batch.startedByName,
    allocations: allocationRows
      .filter((row) => row.batchId === batch.id)
      .map((row) => {
        const ticket = row.ticketId ? ticketById.get(row.ticketId) : undefined;
        return {
          id: row.id,
          ticketNo: ticket?.ticketNo ?? null,
          orderNo: row.orderNo,
          customerName: row.customerName,
          identity: productionIdentityName(
            row.customerName,
            row.orderId ? queueByOrder.get(row.orderId) ?? null : null,
          ),
          table: row.tableLabel,
          qty: row.qty,
          note: row.note,
          allocated: Boolean(row.allocatedAt),
        };
      }),
  }));

  const candidates: BatchCandidateItem[] = itemRows
    .filter((item) => {
      const ticket = ticketById.get(item.ticketId);
      return (
        item.status === "waiting" &&
        !item.batchId &&
        ticket &&
        (ticket.status === "queue" || ticket.status === "cooking")
      );
    })
    .map((item) => ({
      id: item.id,
      ticketNo: ticketById.get(item.ticketId)?.ticketNo ?? "",
      station: item.station,
      menuItemId: item.menuItemId,
      variantId: item.variantId,
      itemName: item.itemName,
      variantLabel: item.variantLabel,
      qty: item.qty,
      note: item.note,
      batchEligible: item.batchEligible,
      customerName: item.customerName,
      tableLabel: item.tableLabel,
      orderNo: item.orderNo,
      createdAt: item.createdAt.toISOString(),
    }));
  const itemOrderId = new Map(itemRows.map((item) => [item.id, item.orderId]));
  const suggestions = buildBatchSuggestions(candidates, {
    windowSec: settings.productionBatchWindowSec,
  }).map((suggestion) => ({
    key: suggestion.key,
    station: suggestion.station,
    itemLabel: suggestion.itemLabel,
    menuItemId: suggestion.items[0]?.menuItemId ?? null,
    variantId: suggestion.items[0]?.variantId ?? null,
    note: suggestion.note,
    totalQty: suggestion.totalQty,
    oldestAt: suggestion.oldestAt,
    items: suggestion.items.map((item) => {
      const orderId = itemOrderId.get(item.id);
      return {
        id: item.id,
        ticketNo: item.ticketNo,
        identity: productionIdentityName(
          item.customerName,
          orderId ? queueByOrder.get(orderId) ?? null : null,
        ),
        table: item.tableLabel,
        orderNo: item.orderNo,
        qty: item.qty,
      };
    }),
  }));

  const load: ProductionStationLoad[] = (["Bar", "Food"] as const).map((station) => {
    const own = ticketRows.filter((row) => normalizeProductionStation(row.station) === station);
    const waiting = own.filter((row) => row.status === "queue");
    const oldest = waiting[0];
    const durations = doneToday
      .filter((row) => normalizeProductionStation(row.station) === station && row.readyAt)
      .map((row) =>
        minutesSince(row.acceptedAt ?? row.createdAt, row.readyAt as Date),
      );
    return {
      station,
      waiting: waiting.length,
      processing: own.filter((row) => row.status === "cooking").length,
      ready: own.filter((row) => row.status === "ready").length,
      oldestWaitingMinutes: oldest ? minutesSince(oldest.createdAt, now) : null,
      avgProductionMinutes: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      slaRisk: own.filter(
        (row) =>
          (row.status === "queue" || row.status === "cooking") &&
          minutesSince(row.createdAt, now) >= Math.ceil(row.targetMinutes * 0.8),
      ).length,
    };
  });

  const canHandover = {
    Bar: canHandoverStation(garage.profile.role, garage.profile.workstation, "Bar"),
    Food: canHandoverStation(garage.profile.role, garage.profile.workstation, "Food"),
  };

  return {
    generatedAt: now.toISOString(),
    batchWindowSec: settings.productionBatchWindowSec,
    tickets,
    batches,
    suggestions,
    load,
    canOperate: {
      Bar: canOperateStation(garage.profile.role, garage.profile.workstation, "Bar"),
      Food: canOperateStation(garage.profile.role, garage.profile.workstation, "Food"),
    },
    canHandover,
    waiters: canHandover.Bar || canHandover.Food ? await listCallableWaiters(garage.profile.outlet.id) : [],
    cancelled: cancelledRows.map((ticket) => ({
      ticketNo: ticket.ticketNo,
      orderNo: ticket.orderNo,
      identity: productionIdentityName(ticket.customerName, null),
      table: ticket.tableLabel,
      station: normalizeProductionStation(ticket.station),
      reason: ticket.issueReason,
      cancelledAt: (ticket.issueAt ?? ticket.updatedAt).toISOString(),
      items: ticket.items,
    })),
    completionPrints: await listCompletionPrints(garage, now),
    sla: normalizeSlaConfig({
      startTargetMinutes: settings.productionStartTargetMinutes,
      deliverTargetMinutes: settings.productionDeliverTargetMinutes,
      warnBeforeMinutes: settings.productionWarnBeforeMinutes,
      busyThreshold: settings.productionBusyThreshold,
      busyExtraMinutes: settings.productionBusyExtraMinutes,
    }),
  };
}

/**
 * Satu tombol "Siap · Panggil": tandai READY (QC) lalu langsung panggil semua waiter.
 * Tiket yang sudah READY cukup dipanggil ulang.
 */
export async function productionReadyAndCall(
  ticketNo: string,
  garage: GarageSession,
  options: { qcConfirmed?: boolean } = {},
) {
  const [ticket] = await getDb()
    .select({ status: kitchenTickets.status })
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);
  if (!ticket) return null;
  if (ticket.status !== "ready") {
    const ready = await updateKitchenStatus(ticketNo, "ready", garage, {
      qcConfirmed: options.qcConfirmed,
    });
    if (!ready) return null;
  }
  return handoverKitchenTicket(ticketNo, null, garage);
}

/** Helper tap nama waiter yang mengambil pesanan → tiket delivered atas nama waiter. */
export async function productionPickup(ticketNo: string, waiterUserId: string, garage: GarageSession) {
  return pickupKitchenTicket(ticketNo, waiterUserId, garage);
}

/** Serahkan langsung ke pelanggan tanpa waiter (kasir/helper) → Diantar. */
export async function productionServeDirect(ticketNo: string, garage: GarageSession) {
  return serveTicketDirect(ticketNo, garage);
}

/** Helper ACC serah-terima + panggil waiter (null = siapa saja). */
export async function productionHandover(
  ticketNo: string,
  waiterUserId: string | null,
  garage: GarageSession,
) {
  return handoverKitchenTicket(ticketNo, waiterUserId, garage);
}

// ---------------------------------------------------------------------------
// Aksi tiket (MULAI / READY / kembalikan)
// ---------------------------------------------------------------------------

export async function productionTicketAction(
  ticketNo: string,
  action: "start" | "ready" | "reopen",
  garage: GarageSession,
  options: { qcConfirmed?: boolean; reason?: string } = {},
) {
  if (action === "start") {
    return updateKitchenStatus(ticketNo, "cooking", garage);
  }
  if (action === "ready") {
    return updateKitchenStatus(ticketNo, "ready", garage, { qcConfirmed: options.qcConfirmed });
  }
  const [ticket] = await getDb()
    .select({ status: kitchenTickets.status })
    .from(kitchenTickets)
    .where(eq(kitchenTickets.ticketNo, ticketNo))
    .limit(1);
  if (!ticket) return null;
  if (ticket.status !== "ready") {
    throw new KitchenTransitionError(ticket.status, "cooking");
  }
  return updateKitchenStatus(ticketNo, "cooking", garage, { reason: options.reason });
}

// ---------------------------------------------------------------------------
// Smart Batch
// ---------------------------------------------------------------------------

async function startProductionBatchImpl(ticketItemIds: string[], garage: GarageSession) {
  const ids = [...new Set(ticketItemIds)];
  if (ids.length < 2) {
    throw new ProductionBatchError("Batch butuh minimal 2 porsi.", "BATCH_INVALID");
  }
  const db = getDb();
  const now = new Date();
  const actorName = garage.user.name;
  const { key: dayKey, start: dayStart } = jakartaDayStart(now);

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        item: productionTicketItems,
        ticketNo: kitchenTickets.ticketNo,
        ticketStatus: kitchenTickets.status,
      })
      .from(productionTicketItems)
      .innerJoin(kitchenTickets, eq(productionTicketItems.ticketId, kitchenTickets.id))
      .where(inArray(productionTicketItems.id, ids));

    if (rows.length !== ids.length) {
      throw new ProductionBatchError("Sebagian porsi tidak ditemukan. Muat ulang papan.", "BATCH_CONFLICT");
    }
    const first = rows[0].item;
    const key = batchKeyFor(first);
    for (const row of rows) {
      if (row.item.status !== "waiting" || row.item.batchId) {
        throw new ProductionBatchError(
          "Porsi sudah diproses oleh staf lain. Muat ulang papan.",
          "BATCH_CONFLICT",
        );
      }
      if (row.ticketStatus !== "queue" && row.ticketStatus !== "cooking") {
        throw new ProductionBatchError("Tiket sudah tidak aktif.", "BATCH_CONFLICT");
      }
      if (!row.item.batchEligible || batchKeyFor(row.item) !== key) {
        throw new ProductionBatchError(
          "Porsi tidak kompatibel (produk/varian/catatan beda).",
          "BATCH_INVALID",
        );
      }
    }
    if (new Set(rows.map((row) => row.ticketNo)).size < 2) {
      throw new ProductionBatchError("Batch harus mencakup minimal 2 order.", "BATCH_INVALID");
    }
    if (!canOperateStation(garage.profile.role, garage.profile.workstation, first.station)) {
      throw new ProductionPermissionError(first.station);
    }

    // Nomor batch = urutan harian; kunci transaksi supaya dua "Mulai batch"
    // bersamaan tidak mendapat nomor sama (unik → error 500).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('garage:production-batch-no'))`);
    const todayBatches = await tx
      .select({ id: productionBatches.id })
      .from(productionBatches)
      .where(gte(productionBatches.createdAt, dayStart));
    const batchNo = `B-${dayKey.slice(2).replace(/-/g, "")}-${String(todayBatches.length + 1).padStart(3, "0")}`;
    const totalQty = rows.reduce((sum, row) => sum + row.item.qty, 0);

    const [batch] = await tx
      .insert(productionBatches)
      .values({
        batchNo,
        outletId: garage.profile.outlet.id,
        station: first.station,
        menuItemId: first.menuItemId,
        variantId: first.variantId,
        itemLabel: productionItemLabel(first.itemName, first.variantLabel),
        note: first.note,
        totalQty,
        status: "processing",
        startedByName: actorName,
        startedAt: now,
      })
      .returning();

    await tx.insert(productionBatchAllocations).values(
      rows.map((row) => ({
        batchId: batch.id,
        ticketItemId: row.item.id,
        ticketId: row.item.ticketId,
        orderId: row.item.orderId,
        qty: row.item.qty,
        customerName: row.item.customerName,
        tableLabel: row.item.tableLabel,
        orderNo: row.item.orderNo,
        note: row.item.note,
      })),
    );

    const claimed = await tx
      .update(productionTicketItems)
      .set({ status: "processing", batchId: batch.id })
      .where(
        and(
          inArray(productionTicketItems.id, ids),
          eq(productionTicketItems.status, "waiting"),
          isNull(productionTicketItems.batchId),
        ),
      )
      .returning({ id: productionTicketItems.id });
    if (claimed.length !== ids.length) {
      throw new ProductionBatchError(
        "Porsi sudah diproses oleh staf lain. Muat ulang papan.",
        "BATCH_CONFLICT",
      );
    }

    const ticketIds = [...new Set(rows.map((row) => row.item.ticketId))];
    await tx
      .update(kitchenTickets)
      .set({ status: "cooking", acceptedAt: now, acceptedByName: actorName, updatedAt: now })
      .where(and(inArray(kitchenTickets.id, ticketIds), eq(kitchenTickets.status, "queue")));

    return { batch, rows, ticketNos: [...new Set(rows.map((row) => row.ticketNo))] };
  });

  await createAuditLog({
    actor: actorLabel(garage),
    action: "Production batch started",
    object: result.batch.batchNo,
    device: garage.profile.deviceLabel,
    status: "processing",
    metadata: {
      batchId: result.batch.id,
      station: result.batch.station,
      itemLabel: result.batch.itemLabel,
      totalQty: result.batch.totalQty,
      ticketNos: result.ticketNos,
      allocations: result.rows.map((row) => ({
        orderNo: row.item.orderNo,
        customerName: row.item.customerName,
        tableLabel: row.item.tableLabel,
        qty: row.item.qty,
      })),
    },
  });

  return result.batch;
}

/**
 * Selesaikan batch: setiap porsi WAJIB ter-allocate ke order asal (coverage
 * 100%). Bila kurang, tidak ada yang disimpan dan error UNALLOCATED membawa
 * jumlah porsi yang belum teralokasi.
 */
async function completeProductionBatchImpl(
  batchId: string,
  allocationIds: string[],
  garage: GarageSession,
  options: { partial?: boolean } = {},
) {
  const db = getDb();
  const now = new Date();
  const actorName = garage.user.name;
  const confirmed = new Set(allocationIds);

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(productionBatches)
      .where(eq(productionBatches.id, batchId))
      .limit(1);
    if (!batch || (batch.outletId && batch.outletId !== garage.profile.outlet.id)) {
      throw new ProductionBatchError("Batch tidak ditemukan.", "BATCH_NOT_FOUND");
    }
    if (batch.status !== "processing") {
      throw new ProductionBatchError("Batch sudah selesai atau dibatalkan.", "BATCH_CONFLICT");
    }
    if (!canOperateStation(garage.profile.role, garage.profile.workstation, batch.station)) {
      throw new ProductionPermissionError(batch.station);
    }

    const allocations = await tx
      .select()
      .from(productionBatchAllocations)
      .where(eq(productionBatchAllocations.batchId, batch.id));
    const coverage = allocationCoverage(
      allocations.map((row) => ({
        qty: row.qty,
        allocated: Boolean(row.allocatedAt) || confirmed.has(row.id),
      })),
      batch.totalQty,
    );
    if (!coverage.complete && !options.partial) {
      throw new ProductionBatchError(
        `UNALLOCATED = ${coverage.unallocatedQty}. Cocokkan setiap porsi ke Nama + Meja + Order dulu.`,
        "UNALLOCATED",
        coverage.unallocatedQty,
      );
    }

    // V4 Partial Batch Completion: hanya porsi yang dipilih (dan belum selesai) yang
    // menjadi READY; batch tetap berjalan sampai semua porsi teralokasi.
    if (!coverage.complete) {
      const fresh = allocations.filter((row) => !row.allocatedAt && confirmed.has(row.id));
      if (!fresh.length) {
        throw new ProductionBatchError("Pilih minimal satu porsi yang sudah jadi.", "BATCH_INVALID");
      }
      const marked = await tx
        .update(productionBatchAllocations)
        .set({ allocatedAt: now, allocatedByName: actorName })
        .where(
          and(
            inArray(
              productionBatchAllocations.id,
              fresh.map((row) => row.id),
            ),
            isNull(productionBatchAllocations.allocatedAt),
          ),
        )
        .returning({ id: productionBatchAllocations.id });
      if (marked.length !== fresh.length) {
        throw new ProductionBatchError("Porsi sudah diselesaikan staf lain. Muat ulang.", "BATCH_CONFLICT");
      }
      const itemIds = fresh.map((row) => row.ticketItemId).filter((id): id is string => Boolean(id));
      if (itemIds.length) {
        await tx
          .update(productionTicketItems)
          .set({ status: "ready", readyAt: now })
          .where(and(inArray(productionTicketItems.id, itemIds), eq(productionTicketItems.batchId, batch.id)));
      }
      return {
        batch,
        allocations: fresh,
        partial: true,
        ticketIds: [...new Set(fresh.map((row) => row.ticketId).filter((id): id is string => Boolean(id)))],
      };
    }

    await tx
      .update(productionBatchAllocations)
      .set({ allocatedAt: now, allocatedByName: actorName })
      .where(
        and(
          eq(productionBatchAllocations.batchId, batch.id),
          isNull(productionBatchAllocations.allocatedAt),
        ),
      );
    await tx
      .update(productionTicketItems)
      .set({ status: "ready", readyAt: now })
      .where(eq(productionTicketItems.batchId, batch.id));
    const [completed] = await tx
      .update(productionBatches)
      .set({ status: "completed", completedAt: now, completedByName: actorName })
      .where(and(eq(productionBatches.id, batch.id), eq(productionBatches.status, "processing")))
      .returning();
    if (!completed) {
      throw new ProductionBatchError("Batch sudah diselesaikan staf lain.", "BATCH_CONFLICT");
    }

    return {
      batch: completed,
      allocations,
      partial: false,
      ticketIds: [
        ...new Set(allocations.map((row) => row.ticketId).filter((id): id is string => Boolean(id))),
      ],
    };
  });

  // Tiket yang seluruh porsinya sudah ready → READY (producer-owned). QC sudah
  // terjadi di langkah allocation per porsi.
  const readyIds = await fullyReadyTicketIds(db, result.ticketIds);
  const readyTicketNos = await ticketNosByIds(db, readyIds);
  const readied: string[] = [];
  for (const ticketNo of readyTicketNos) {
    try {
      const ticket = await updateKitchenStatus(ticketNo, "ready", garage, { qcConfirmed: true });
      if (ticket?.status === "ready") readied.push(ticketNo);
    } catch (error) {
      if (!(error instanceof KitchenTransitionError)) throw error;
    }
  }

  await createAuditLog({
    actor: actorLabel(garage),
    action: result.partial ? "Production batch partially completed" : "Production batch completed",
    object: result.batch.batchNo,
    device: garage.profile.deviceLabel,
    status: result.partial ? "partial" : "completed",
    metadata: {
      batchId: result.batch.id,
      station: result.batch.station,
      itemLabel: result.batch.itemLabel,
      totalQty: result.batch.totalQty,
      allocated: result.allocations.map((row) => ({
        orderNo: row.orderNo,
        customerName: row.customerName,
        tableLabel: row.tableLabel,
        qty: row.qty,
      })),
      readyTicketNos: readied,
    },
  });

  return { batch: result.batch, partial: result.partial, readyTicketNos: readied };
}

async function cancelProductionBatchImpl(
  batchId: string,
  reason: string,
  garage: GarageSession,
) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new ProductionBatchError("Alasan batal batch wajib diisi.", "BATCH_INVALID");
  }
  const db = getDb();
  const now = new Date();

  const batch = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(productionBatches)
      .where(eq(productionBatches.id, batchId))
      .limit(1);
    if (!current || (current.outletId && current.outletId !== garage.profile.outlet.id)) {
      throw new ProductionBatchError("Batch tidak ditemukan.", "BATCH_NOT_FOUND");
    }
    if (current.status !== "processing") {
      throw new ProductionBatchError("Batch sudah selesai atau dibatalkan.", "BATCH_CONFLICT");
    }
    if (!canOperateStation(garage.profile.role, garage.profile.workstation, current.station)) {
      throw new ProductionPermissionError(current.station);
    }
    // Porsi yang sudah diselesaikan sebagian (READY) tetap READY dan tercatat;
    // hanya porsi yang belum jadi kembali ke Waiting.
    await tx
      .update(productionTicketItems)
      .set({ status: "waiting", batchId: null })
      .where(and(eq(productionTicketItems.batchId, current.id), ne(productionTicketItems.status, "ready")));
    await tx
      .delete(productionBatchAllocations)
      .where(
        and(eq(productionBatchAllocations.batchId, current.id), isNull(productionBatchAllocations.allocatedAt)),
      );
    const [cancelled] = await tx
      .update(productionBatches)
      .set({ status: "cancelled", completedAt: now, completedByName: garage.user.name })
      .where(eq(productionBatches.id, current.id))
      .returning();
    return cancelled;
  });

  await createAuditLog({
    actor: actorLabel(garage),
    action: "Production batch cancelled",
    object: batch.batchNo,
    device: garage.profile.deviceLabel,
    status: "cancelled",
    metadata: {
      batchId: batch.id,
      station: productionStationLabel(batch.station),
      reason: trimmed,
    },
  });

  return batch;
}

/**
 * Tandai chit tiket sudah tercetak di printer stasiun (Bar/Dapur). Hanya baris
 * yang belum bertanda yang diisi, jadi dua perangkat stasiun yang menekan
 * "Cetak" hampir bersamaan tidak saling menimpa. Mengembalikan jumlah baris yang
 * benar-benar berubah.
 */
export async function markProductionChitsPrinted(
  ticketNos: string[],
  /** Station perangkat; null = semua (kasir / Owner / Manajer / workstation all). */
  onlyStation: "Bar" | "Food" | null = null,
): Promise<number> {
  const unique = [...new Set(ticketNos.map((no) => no.trim()).filter(Boolean))].slice(0, 100);
  if (unique.length === 0) return 0;
  const rows = await getDb()
    .update(kitchenTickets)
    .set({ chitPrintedAt: new Date() })
    .where(
      and(
        inArray(kitchenTickets.ticketNo, unique),
        isNull(kitchenTickets.chitPrintedAt),
        // Tablet Bar tidak boleh menandai chit Dapur "sudah dicetak" (dan sebaliknya).
        onlyStation === "Bar"
          ? sql`lower(${kitchenTickets.station}) = 'bar'`
          : onlyStation === "Food"
            ? sql`lower(${kitchenTickets.station}) <> 'bar'`
            : undefined,
      ),
    )
    .returning({ id: kitchenTickets.id });
  // Tablet lain di station yang sama langsung melihat "sudah dicetak".
  if (rows.length) publishProductionChange();
  return rows.length;
}

// Realtime: setiap mutasi produksi yang SUKSES memancarkan tanda perubahan
// (Production Hub & Control Center langsung mengambil ulang). Lihat production-events.ts.
export const startProductionBatch = notifyingProduction(startProductionBatchImpl);
export const completeProductionBatch = notifyingProduction(completeProductionBatchImpl);
export const cancelProductionBatch = notifyingProduction(cancelProductionBatchImpl);

// ---------------------------------------------------------------------------
// V4 Batch Produksi — riwayat batch (read-only) + status tiket terkait (Recall)
// ---------------------------------------------------------------------------

export type ProductionBatchHistoryRow = {
  id: string;
  batchNo: string;
  station: "Bar" | "Food";
  itemLabel: string;
  menuItemId: string | null;
  note: string | null;
  totalQty: number;
  doneQty: number;
  status: string;
  startedAt: string;
  startedByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  allocations: Array<{
    id: string;
    ticketNo: string | null;
    orderNo: string | null;
    table: string;
    customerName: string | null;
    qty: number;
    allocatedAt: string | null;
    allocatedByName: string | null;
    ticketStatus: string | null;
  }>;
};

export async function getProductionBatchHistory(
  garage: GarageSession,
  params: { date?: string | null } = {},
): Promise<{ date: string; batches: ProductionBatchHistoryRow[] }> {
  const db = getDb();
  const { key: todayKey } = jakartaDayStart(new Date());
  const key = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey;
  const start = new Date(`${key}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  const rows = await db
    .select()
    .from(productionBatches)
    .where(
      and(
        eq(productionBatches.outletId, garage.profile.outlet.id),
        gte(productionBatches.startedAt, start),
        sql`${productionBatches.startedAt} < ${end}`,
      ),
    )
    .orderBy(desc(productionBatches.startedAt))
    .limit(200);
  const ids = rows.map((row) => row.id);
  const allocations = ids.length
    ? await db
        .select({ allocation: productionBatchAllocations, ticketNo: kitchenTickets.ticketNo, ticketStatus: kitchenTickets.status })
        .from(productionBatchAllocations)
        .leftJoin(kitchenTickets, eq(kitchenTickets.id, productionBatchAllocations.ticketId))
        .where(inArray(productionBatchAllocations.batchId, ids))
        .orderBy(asc(productionBatchAllocations.createdAt))
    : [];
  return {
    date: key,
    batches: rows.map((batch) => {
      const own = allocations.filter((row) => row.allocation.batchId === batch.id);
      return {
        id: batch.id,
        batchNo: batch.batchNo,
        station: normalizeProductionStation(batch.station),
        itemLabel: batch.itemLabel,
        menuItemId: batch.menuItemId,
        note: batch.note,
        totalQty: batch.totalQty,
        doneQty: own.filter((row) => row.allocation.allocatedAt).reduce((sum, row) => sum + row.allocation.qty, 0),
        status: batch.status,
        startedAt: batch.startedAt.toISOString(),
        startedByName: batch.startedByName,
        completedAt: batch.completedAt?.toISOString() ?? null,
        completedByName: batch.completedByName ?? null,
        allocations: own.map((row) => ({
          id: row.allocation.id,
          ticketNo: row.ticketNo ?? null,
          orderNo: row.allocation.orderNo,
          table: row.allocation.tableLabel,
          customerName: row.allocation.customerName,
          qty: row.allocation.qty,
          allocatedAt: row.allocation.allocatedAt?.toISOString() ?? null,
          allocatedByName: row.allocation.allocatedByName ?? null,
          ticketStatus: row.ticketStatus ?? null,
        })),
      };
    }),
  };
}
