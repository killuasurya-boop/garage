// =============================================================================
// PRODUCTION HUB — engine server: papan produksi, Smart Batch, Allocation.
// Acuan: GARAGE OS Production Hub v1.0 §6–§10, Workflow Operasional §8–§11.
//
// Prinsip: batch menggabung PEKERJAAN, tidak pernah menggabung identitas.
// Setiap porsi tetap membawa Nama + Meja + Order ID sampai diantar.
// =============================================================================

import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
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
  KitchenTransitionError,
  listCallableWaiters,
  ProductionPermissionError,
  roleDisplayName,
  updateKitchenStatus,
} from "@/lib/garage-service";
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

  const ticketRows = await db
    .select()
    .from(kitchenTickets)
    .where(inArray(kitchenTickets.status, ACTIVE_TICKET_STATUSES))
    .orderBy(asc(kitchenTickets.createdAt))
    .limit(300);
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
    .where(eq(productionBatches.status, "processing"))
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

  const cancelledRows = await db
    .select()
    .from(kitchenTickets)
    .where(
      and(
        eq(kitchenTickets.status, "cancelled"),
        gte(kitchenTickets.issueAt, new Date(now.getTime() - CANCELLED_VISIBLE_MS)),
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
    const items = itemsByTicket.get(ticket.id) ?? [];
    const legacy = items.length === 0;
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
    waiters: canHandover.Bar || canHandover.Food ? await listCallableWaiters() : [],
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

export async function startProductionBatch(ticketItemIds: string[], garage: GarageSession) {
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
export async function completeProductionBatch(
  batchId: string,
  allocationIds: string[],
  garage: GarageSession,
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
    if (!batch) throw new ProductionBatchError("Batch tidak ditemukan.", "BATCH_NOT_FOUND");
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
    if (!coverage.complete) {
      throw new ProductionBatchError(
        `UNALLOCATED = ${coverage.unallocatedQty}. Cocokkan setiap porsi ke Nama + Meja + Order dulu.`,
        "UNALLOCATED",
        coverage.unallocatedQty,
      );
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
    action: "Production batch completed",
    object: result.batch.batchNo,
    device: garage.profile.deviceLabel,
    status: "completed",
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

  return { batch: result.batch, readyTicketNos: readied };
}

export async function cancelProductionBatch(
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
    if (!current) throw new ProductionBatchError("Batch tidak ditemukan.", "BATCH_NOT_FOUND");
    if (current.status !== "processing") {
      throw new ProductionBatchError("Batch sudah selesai atau dibatalkan.", "BATCH_CONFLICT");
    }
    if (!canOperateStation(garage.profile.role, garage.profile.workstation, current.station)) {
      throw new ProductionPermissionError(current.station);
    }
    await tx
      .update(productionTicketItems)
      .set({ status: "waiting", batchId: null })
      .where(eq(productionTicketItems.batchId, current.id));
    await tx
      .delete(productionBatchAllocations)
      .where(eq(productionBatchAllocations.batchId, current.id));
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
