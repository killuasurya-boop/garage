// =============================================================================
// GARAGE CONTROL CENTER — service server. Satu sumber kebenaran: Production Hub
// (`getProductionBoard`) + tabel yang sudah ada (kitchen_tickets,
// production_ticket_items, production_batches, orders, staff_attendance_v2,
// inventory_items, menu_recipes). Tidak ada tabel/order baru, tidak ada nominal
// uang di payload ini (layar dilihat semua staf).
// =============================================================================

import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryItems,
  kitchenTickets,
  menuRecipes,
  orders,
  productionBatches,
  productionTicketItems,
  staffAttendanceV2,
  staffProfiles,
} from "@/db/schema";
import { getProductionBoard } from "@/lib/garage-production";
import {
  avg,
  batchScore,
  buildAlerts,
  buildInsights,
  changePct,
  detectBottlenecks,
  forecastNext60,
  isAtSlaRisk,
  isOverSla,
  loadLevel,
  minutesBetween,
  nextBestAction,
  opsStatus,
  pct,
  READY_DELAY_MINUTES,
  servingLoadPct,
  stationLoadPct,
  type OpsStation,
  type StationSnapshot,
} from "@/lib/ops-center-engine";
import type { OpsCenterData, OpsKpiBlock } from "@/lib/ops-center-types";
import type { GarageSession } from "@/lib/server-auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEAD_ORDER_STATUSES = new Set(["voided", "rejected", "cancelled"]);

function jakartaDay(now: Date) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { key, start: new Date(`${key}T00:00:00+07:00`) };
}

const jakartaHour = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(d));

type TicketRow = {
  station: string;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  targetMinutes: number;
  issueAt: Date | null;
  acceptedByName: string | null;
  readyByName: string | null;
  deliveredByName: string | null;
};

const prepMinutes = (t: TicketRow) => (t.readyAt ? minutesBetween(t.createdAt, t.readyAt) : null);

/** KPI satu periode dari tiket yang SIAP dalam periode itu (timestamp nyata). */
function kpiFor(rows: TicketRow[]): OpsKpiBlock {
  const ready = rows.filter((t) => t.readyAt);
  const preps = ready.map((t) => prepMinutes(t)!);
  const onTime = ready.filter((t) => prepMinutes(t)! <= t.targetMinutes).length;
  const queues = ready.filter((t) => t.acceptedAt).map((t) => minutesBetween(t.createdAt, t.acceptedAt!));
  const serving = ready.filter((t) => t.deliveredAt).map((t) => minutesBetween(t.readyAt!, t.deliveredAt!));
  return {
    ready: ready.length,
    onTimePct: pct(onTime, ready.length),
    overSla: ready.length - onTime,
    avgPrepMinutes: avg(preps),
    avgQueueMinutes: avg(queues),
    avgServingDelayMinutes: avg(serving),
  };
}

export async function getOpsCenter(garage: GarageSession): Promise<OpsCenterData> {
  // Board dulu (memanggil getAppSettings — PGlite satu koneksi, jangan paralel).
  const board = await getProductionBoard(garage);
  const db = getDb();
  const now = new Date();
  const { key: todayKey, start: todayStart } = jakartaDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const weekStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const historyStart = new Date(now.getTime() - 28 * DAY_MS - 60 * 60 * 1000);
  const outletId = garage.profile.outlet.id;

  // ---- Tiket 7 hari + hari ini (satu query) ----------------------------------
  const ticketRows: TicketRow[] = await db
    .select({
      station: kitchenTickets.station,
      status: kitchenTickets.status,
      createdAt: kitchenTickets.createdAt,
      acceptedAt: kitchenTickets.acceptedAt,
      readyAt: kitchenTickets.readyAt,
      deliveredAt: kitchenTickets.deliveredAt,
      targetMinutes: kitchenTickets.targetMinutes,
      issueAt: kitchenTickets.issueAt,
      acceptedByName: kitchenTickets.acceptedByName,
      readyByName: kitchenTickets.readyByName,
      deliveredByName: kitchenTickets.deliveredByName,
    })
    .from(kitchenTickets)
    .where(gte(kitchenTickets.createdAt, weekStart))
    .limit(20000);

  const readyIn = (from: Date, to: Date) =>
    ticketRows.filter((t) => t.readyAt && t.readyAt >= from && t.readyAt < to);
  const tomorrow = new Date(todayStart.getTime() + DAY_MS);
  const readyToday = readyIn(todayStart, tomorrow);
  const today = kpiFor(readyToday);
  const yesterday = kpiFor(readyIn(yesterdayStart, todayStart));
  const week = kpiFor(readyIn(weekStart, todayStart));

  // ---- Porsi & batch -----------------------------------------------------------
  const itemRows = await db
    .select({
      station: productionTicketItems.station,
      qty: productionTicketItems.qty,
      batchId: productionTicketItems.batchId,
      batchEligible: productionTicketItems.batchEligible,
    })
    .from(productionTicketItems)
    .where(gte(productionTicketItems.readyAt, todayStart));
  const batchEff = (station?: OpsStation) => {
    const rows = itemRows.filter((r) => r.batchEligible && (!station || r.station === station));
    const total = rows.reduce((s, r) => s + r.qty, 0);
    const batched = rows.filter((r) => r.batchId).reduce((s, r) => s + r.qty, 0);
    return { pct: pct(batched, total), batchedQty: batched, eligibleQty: total };
  };

  const batchRows = await db
    .select({ itemLabel: productionBatches.itemLabel, totalQty: productionBatches.totalQty })
    .from(productionBatches)
    .where(and(eq(productionBatches.status, "completed"), gte(productionBatches.completedAt, weekStart)));
  const batchedByLabel = new Map<string, number>();
  for (const b of batchRows) batchedByLabel.set(b.itemLabel, (batchedByLabel.get(b.itemLabel) ?? 0) + b.totalQty);
  const topBatchedEntry = [...batchedByLabel.entries()].sort((a, b) => b[1] - a[1])[0];

  // ---- Order (jumlah saja, tanpa nominal) -------------------------------------
  const orderRows = await db
    .select({ createdAt: orders.createdAt, status: orders.status })
    .from(orders)
    .where(and(eq(orders.outletId, outletId), gte(orders.createdAt, historyStart)));
  const liveOrders = orderRows.filter((o) => !DEAD_ORDER_STATUSES.has(o.status));
  const ordersToday = orderRows.filter((o) => o.createdAt >= todayStart);
  const cancelledToday = ordersToday.filter((o) => DEAD_ORDER_STATUSES.has(o.status)).length;
  const completedToday = ordersToday.filter((o) => o.status === "paid").length;

  const ordersByHour7d = Array<number>(24).fill(0);
  for (const o of liveOrders) {
    if (o.createdAt >= weekStart && o.createdAt < todayStart) ordersByHour7d[jakartaHour(o.createdAt)] += 1;
  }

  // Forecast: jendela [jam ini, +60 mnt] pada hari yang sama 1–4 minggu lalu.
  const historyTickets = await db
    .select({ createdAt: kitchenTickets.createdAt, station: kitchenTickets.station })
    .from(kitchenTickets)
    .where(and(gte(kitchenTickets.createdAt, historyStart), lt(kitchenTickets.createdAt, weekStart)));
  const samples = [1, 2, 3, 4].map((weeksAgo) => {
    const from = now.getTime() - weeksAgo * 7 * DAY_MS;
    const to = from + 60 * 60 * 1000;
    const inWin = (d: Date) => d.getTime() >= from && d.getTime() < to;
    const winTickets = [...historyTickets, ...ticketRows].filter((t) => inWin(t.createdAt));
    return {
      orders: liveOrders.filter((o) => inWin(o.createdAt)).length,
      barTickets: winTickets.filter((t) => t.station === "Bar").length,
      foodTickets: winTickets.filter((t) => t.station === "Food").length,
    };
  });
  const forecast = forecastNext60(samples);

  // ---- Staf hadir (absensi hari ini, belum pulang) -----------------------------
  const present = await db
    .select({ role: staffProfiles.role, workstation: staffProfiles.workstation })
    .from(staffAttendanceV2)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffAttendanceV2.staffUserId))
    .where(
      and(
        eq(staffAttendanceV2.date, todayKey),
        isNotNull(staffAttendanceV2.checkinAt),
        isNull(staffAttendanceV2.checkoutAt),
      ),
    );
  const staffOn = {
    Bar: present.filter((p) => p.workstation === "bar" || p.workstation === "all").length,
    Food: present.filter((p) => p.workstation === "dapur" || p.workstation === "all").length,
    waiters: present.filter((p) => p.role === "Waiter").length,
  };

  // ---- Stok ---------------------------------------------------------------------
  const stockRows = await db
    .select({
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      onHand: inventoryItems.onHand,
      min: inventoryItems.min,
      status: inventoryItems.status,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.stage, "active"), inArray(inventoryItems.status, ["low", "watch"])))
    .limit(60);
  const lowSkus = new Set(stockRows.filter((r) => r.status === "low").map((r) => r.sku));

  // Risiko stok per saran batch: resep item batch memakai bahan berstatus low.
  const menuIdOf = (key: string) => key.split("|")[1] || null;
  const batchMenuIds = [...new Set(board.suggestions.map((s) => menuIdOf(s.key)).filter((v): v is string => Boolean(v)))];
  const recipeRows =
    batchMenuIds.length && lowSkus.size
      ? await db
          .select({ menuItemId: menuRecipes.menuItemId, sku: menuRecipes.inventorySku })
          .from(menuRecipes)
          .where(and(inArray(menuRecipes.menuItemId, batchMenuIds), eq(menuRecipes.status, "active")))
      : [];
  const nameBySku = new Map(stockRows.map((r) => [r.sku, r.name]));
  const batchStockRisks = board.suggestions
    .map((s) => {
      const id = menuIdOf(s.key);
      const ingredients = [
        ...new Set(
          recipeRows
            .filter((r) => r.menuItemId === id && r.sku && lowSkus.has(r.sku))
            .map((r) => nameBySku.get(r.sku!) ?? r.sku!),
        ),
      ];
      return { key: s.key, itemLabel: s.itemLabel, ingredients };
    })
    .filter((r) => r.ingredients.length > 0);

  // ---- Live: antrean, station, serving ----------------------------------------
  const tickets = board.tickets;
  const active = tickets.filter((t) => t.status === "queue" || t.status === "cooking" || t.status === "ready");
  const readyTickets = tickets
    .filter((t) => t.status === "ready" && t.readyAt)
    .map((t) => ({ ...t, readyMinutes: minutesBetween(t.readyAt!, now) }))
    .sort((a, b) => b.readyMinutes - a.readyMinutes);
  const readyDelayed = readyTickets.filter((t) => t.readyMinutes > READY_DELAY_MINUTES);

  const stations = (["Bar", "Food"] as const).map((station) => {
    const mine = tickets.filter((t) => t.station === station);
    const waiting = mine.filter((t) => t.status === "queue").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const nba = nextBestAction(station, tickets, board.suggestions, now);
    const kpi = kpiFor(readyToday.filter((t) => t.station === station));
    // Durasi produksi nyata hari ini (mulai → siap) untuk estimasi beban.
    const productionDurations = readyToday
      .filter((t) => t.station === station && t.acceptedAt && t.readyAt)
      .map((t) => minutesBetween(t.acceptedAt!, t.readyAt!));
    const loadPct = stationLoadPct(tickets, station, staffOn[station], {
      avgMinutes: avg(productionDurations),
      samples: productionDurations.length,
    });
    const eff = batchEff(station);
    const suggestions = board.suggestions
      .filter((s) => s.station === station)
      .map((s) => ({
        ...s,
        score: batchScore(s, waiting[0]?.targetMinutes ?? (station === "Bar" ? 5 : 15), now),
        stockRisk: batchStockRisks.find((r) => r.key === s.key)?.ingredients ?? [],
      }))
      .sort((a, b) => b.score.score - a.score.score);
    return {
      station,
      loadPct,
      loadLevel: loadLevel(loadPct),
      staffOnShift: staffOn[station],
      waiting: waiting.length,
      processing: mine.filter((t) => t.status === "cooking").length,
      ready: mine.filter((t) => t.status === "ready").length,
      oldestWaitingMinutes: waiting[0] ? minutesBetween(waiting[0].createdAt, now) : null,
      oldestTargetMinutes: waiting[0]?.targetMinutes ?? null,
      slaRisk: mine.filter((t) => isAtSlaRisk(t, now) && !isOverSla(t, now)).length,
      overSla: mine.filter((t) => isOverSla(t, now)).length,
      runningBatches: board.batches.filter((b) => b.station === station).length,
      nextBestAction: nba,
      suggestions,
      kpi: { ...kpi, batchEfficiencyPct: eff.pct },
    };
  });

  const snapshots: StationSnapshot[] = stations.map((s) => ({
    station: s.station,
    loadPct: s.loadPct,
    waiting: s.waiting,
    oldestMinutes: s.oldestWaitingMinutes,
    slaRisk: s.slaRisk,
    overSla: s.overSla,
    topBatchLabel: s.suggestions[0] ? `${s.suggestions[0].itemLabel} ×${s.suggestions[0].totalQty}` : null,
  }));
  const servingPct = servingLoadPct(readyTickets.length, staffOn.waiters);
  const oldest = stations
    .filter((s) => s.oldestWaitingMinutes != null)
    .sort((a, b) => b.oldestWaitingMinutes! / b.oldestTargetMinutes! - a.oldestWaitingMinutes! / a.oldestTargetMinutes!)[0];

  const status = opsStatus({
    waiting: stations.reduce((s, x) => s + x.waiting, 0),
    overSla: stations.reduce((s, x) => s + x.overSla, 0),
    slaRisk: stations.reduce((s, x) => s + x.slaRisk, 0),
    readyDelayed: readyDelayed.length,
    oldestWaitingMinutes: oldest?.oldestWaitingMinutes ?? null,
    oldestTargetMinutes: oldest?.oldestTargetMinutes ?? null,
    maxLoadPct: Math.max(...stations.map((s) => s.loadPct), servingPct),
  });

  const lowStock = stockRows.filter((r) => r.status === "low");
  const alerts = buildAlerts({
    stations: snapshots,
    readyDelayed: readyDelayed.map((t) => ({ ticketNo: t.ticketNo, table: t.table, minutes: t.readyMinutes })),
    batchOpportunities: board.suggestions.length,
    lowStock,
    batchStockRisks,
  });
  const bottlenecks = detectBottlenecks(
    snapshots,
    { loadPct: servingPct, delayed: readyDelayed.length, oldestReadyMinutes: readyTickets[0]?.readyMinutes ?? null },
    lowStock.length,
  );
  const insights = buildInsights({
    ordersByHour7d,
    topBatched: topBatchedEntry ? { label: topBatchedEntry[0], qty: topBatchedEntry[1] } : null,
    stationAvg: stations.map((s) => {
      const wk = kpiFor(readyIn(weekStart, todayStart).filter((t) => t.station === s.station));
      return { station: s.station, today: s.kpi.avgPrepMinutes, week: wk.avgPrepMinutes, samplesToday: s.kpi.ready };
    }),
  });

  // ---- My KPI (atribusi berdasar nama yang tercatat di tiket) -----------------
  const myName = garage.user.name;
  const mine = readyToday.filter((t) => t.readyByName === myName || t.acceptedByName === myName);
  const myKpi = kpiFor(mine);
  const myServed = ticketRows.filter(
    (t) => t.deliveredByName === myName && t.deliveredAt && t.deliveredAt >= todayStart,
  ).length;

  const remakeToday = ticketRows.filter(
    (t) => t.issueAt && t.issueAt >= todayStart && t.status !== "cancelled",
  ).length;
  const effAll = batchEff();
  const totalBatchSetupsSaved = board.suggestions.reduce((s, x) => s + Math.max(0, x.totalQty - 1), 0);

  return {
    generatedAt: now.toISOString(),
    batchWindowSec: board.batchWindowSec,
    status,
    live: {
      activeOrders: new Set(active.map((t) => t.orderNo ?? t.ticketNo)).size,
      waiting: stations.reduce((s, x) => s + x.waiting, 0),
      inProduction: stations.reduce((s, x) => s + x.processing, 0) + board.batches.length,
      readyToServe: readyTickets.length,
      oldestWaitingMinutes: oldest?.oldestWaitingMinutes ?? null,
      avgPrepMinutes: today.avgPrepMinutes,
      onTimePct: today.onTimePct,
      batchEfficiencyPct: effAll.pct,
      batchOpportunities: board.suggestions.length,
      batchSetupsSavable: totalBatchSetupsSaved,
    },
    stations,
    serving: {
      loadPct: servingPct,
      loadLevel: loadLevel(servingPct),
      waitersOnShift: staffOn.waiters,
      ready: readyTickets.slice(0, 12).map((t) => ({
        ticketNo: t.ticketNo,
        orderNo: t.orderNo,
        table: t.table,
        identity: t.identity,
        station: t.station,
        items: t.items.reduce((s, i) => s + i.qty, 0),
        readyAt: t.readyAt!,
        readyMinutes: t.readyMinutes,
        called: Boolean(t.handoverAt),
        delayed: t.readyMinutes > READY_DELAY_MINUTES,
      })),
      delayed: readyDelayed.length,
      avgServingDelayMinutes: today.avgServingDelayMinutes,
    },
    queue: tickets
      .filter((t) => t.status === "queue" || t.status === "cooking")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, 14)
      .map((t) => ({
        ticketNo: t.ticketNo,
        orderNo: t.orderNo,
        table: t.table,
        identity: t.identity,
        station: t.station,
        status: t.status,
        createdAt: t.createdAt,
        waitingMinutes: minutesBetween(t.createdAt, now),
        targetMinutes: t.targetMinutes,
        slaRisk: isAtSlaRisk(t, now),
        overSla: isOverSla(t, now),
        items: t.items.map((i) => `${i.qty}× ${i.label}${i.note ? ` (${i.note})` : ""}`),
      })),
    alerts,
    bottlenecks,
    team: {
      ordersToday: ordersToday.length,
      completedToday,
      cancelledToday,
      remakeToday,
      today: { ...today, batchEfficiencyPct: effAll.pct },
      yesterday,
      week,
      trend: {
        avgPrepVsYesterdayPct: changePct(today.avgPrepMinutes, yesterday.avgPrepMinutes),
        avgPrepVsWeekPct: changePct(today.avgPrepMinutes, week.avgPrepMinutes),
        onTimeVsWeekPts:
          today.onTimePct != null && week.onTimePct != null ? today.onTimePct - week.onTimePct : null,
      },
    },
    me: {
      name: myName,
      handled: mine.length,
      served: myServed,
      onTimePct: myKpi.onTimePct,
      avgPrepMinutes: myKpi.avgPrepMinutes,
    },
    insights,
    forecast,
    prep: {
      low: lowStock.slice(0, 10).map((r) => ({ name: r.name, onHand: r.onHand, min: r.min, unit: r.unit })),
      watch: stockRows
        .filter((r) => r.status === "watch")
        .slice(0, 10)
        .map((r) => ({ name: r.name, onHand: r.onHand, min: r.min, unit: r.unit })),
    },
    canOperate: board.canOperate,
  };
}
