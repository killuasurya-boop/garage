import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  employeeAttendances,
  expenses,
  inventoryItems,
  kitchenTickets,
  orderItems,
  orders,
  staffProfiles,
} from "@/db/schema";
import {
  getApprovalStats,
  getAuditStats,
  getFinanceBrief,
} from "@/lib/garage-service";

// ============================================================================
// Laporan Owner Gabungan — agregasi lintas-modul untuk export PDF/Excel.
//
// Berbasis data nyata yang sudah ada di sistem:
//   - P&L harian: revenue (paid orders) − expenses (recorded/approved) = net
//   - Top item terjual (qty + omzet)
//   - Stok rendah
//   - Kehadiran staf (proxy labor) — hadir/absen/telat
//   - Tiket dapur telat
//   - Approvals & Audit ringkas + Finance Guard
//
// CATATAN: belum ada "waste" sebagai jenis stock movement di sistem, jadi
// laporan ini tidak menampilkan waste. Tambahkan saat modul pencatatan
// waste/spoilage dibuat.
// ============================================================================

export type OwnerReportData = {
  dateText: string;
  generatedAt: string;
  headline: string;
  pnl: {
    revenue: number;
    orderCount: number;
    expenses: number;
    net: number;
    avgOrderValue: number;
  };
  topItems: Array<{
    itemName: string;
    variantLabel: string;
    qty: number;
    revenue: number;
  }>;
  lowStock: Array<{
    sku: string;
    name: string;
    onHand: number;
    min: number;
    unit: string;
  }>;
  attendance: {
    present: number;
    absent: number;
    lateIn: number;
    totalStaff: number;
  };
  kitchen: {
    activeTickets: number;
    lateTickets: number;
    lateList: Array<{
      ticketNo: string;
      station: string;
      status: string;
      tableLabel: string;
      elapsed: number;
      overBy: number;
    }>;
  };
  approvals: Awaited<ReturnType<typeof getApprovalStats>> | null;
  audit: Awaited<ReturnType<typeof getAuditStats>> | null;
  financeGuard: {
    level?: string;
    healthScore?: number;
    brief?: string;
  } | null;
  recommendedActions: Array<{
    label: string;
    severity: "info" | "warn" | "danger";
  }>;
};

const JAKARTA_OFFSET = "+07:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export function jakartaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function rangeFor(dateText: string): { start: Date; end: Date } | null {
  const start = new Date(`${dateText}T00:00:00${JAKARTA_OFFSET}`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function idrCompact(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
  return `Rp ${Math.round(n)}`;
}

export async function getOwnerReportData(
  dateTextInput?: string,
): Promise<OwnerReportData> {
  const dateText = dateTextInput || jakartaTodayKey();
  const range = rangeFor(dateText);
  if (!range) {
    throw new Error("Tanggal harus format YYYY-MM-DD.");
  }
  const { start, end } = range;
  const db = await getDb();

  const [
    revenueRow,
    expenseRow,
    topItemRows,
    lowStockRows,
    activeTicketsRow,
    lateTicketsRows,
    attendanceToday,
    staffActiveRow,
    financeBrief,
    approvals,
    audit,
  ] = await Promise.all([
    db
      .select({
        revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)::int`,
        orderCount: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "paid"),
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
        ),
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          gte(expenses.expenseDate, start),
          lt(expenses.expenseDate, end),
          sql`${expenses.status} IN ('recorded', 'approved', 'paid')`,
        ),
      ),
    db
      .select({
        itemName: orderItems.itemName,
        variantLabel: orderItems.variantLabel,
        qty: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)::int`,
        revenue: sql<number>`COALESCE(SUM(${orderItems.lineTotal}), 0)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.status, "paid"),
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
        ),
      )
      .groupBy(orderItems.itemName, orderItems.variantLabel)
      .orderBy(desc(sql`SUM(${orderItems.qty})`))
      .limit(10),
    db
      .select({
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        onHand: inventoryItems.onHand,
        min: inventoryItems.min,
        unit: inventoryItems.unit,
      })
      .from(inventoryItems)
      .where(sql`${inventoryItems.status} = 'low'`)
      .limit(15),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(kitchenTickets)
      .where(sql`${kitchenTickets.status} IN ('queue', 'cooking', 'ready')`),
    db
      .select({
        ticketNo: kitchenTickets.ticketNo,
        station: kitchenTickets.station,
        status: kitchenTickets.status,
        elapsed: kitchenTickets.elapsed,
        targetMinutes: kitchenTickets.targetMinutes,
        tableLabel: kitchenTickets.tableLabel,
      })
      .from(kitchenTickets)
      .where(
        and(
          sql`${kitchenTickets.status} IN ('queue', 'cooking')`,
          sql`${kitchenTickets.elapsed} > ${kitchenTickets.targetMinutes}`,
        ),
      )
      .limit(10),
    db
      .select({
        staffId: employeeAttendances.staffId,
        action: employeeAttendances.action,
        status: employeeAttendances.status,
      })
      .from(employeeAttendances)
      .where(
        and(
          gte(employeeAttendances.timestamp, start),
          lt(employeeAttendances.timestamp, end),
        ),
      ),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(staffProfiles)
      .where(sql`${staffProfiles.status} = 'active'`),
    getFinanceBrief().catch(() => null),
    getApprovalStats().catch(() => null),
    getAuditStats().catch(() => null),
  ]);

  // P&L
  const revenue = Number(revenueRow[0]?.revenue ?? 0);
  const orderCount = Number(revenueRow[0]?.orderCount ?? 0);
  const expenseTotal = Number(expenseRow[0]?.total ?? 0);
  const net = revenue - expenseTotal;
  const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  // Kehadiran unik & telat (mirror daily-brief).
  const seen = new Set<string>();
  let lateIn = 0;
  for (const a of attendanceToday) {
    if (a.action === "in" && a.status === "late") lateIn += 1;
    seen.add(a.staffId ?? "");
  }
  const present = seen.size;
  const totalStaff = Number(staffActiveRow[0]?.total ?? 0);
  const absent = Math.max(0, totalStaff - present);

  const activeTickets = Number(activeTicketsRow[0]?.total ?? 0);
  const lateTickets = lateTicketsRows.length;

  const financeGuard = financeBrief?.guard
    ? {
        level: financeBrief.guard.level,
        healthScore: financeBrief.guard.healthScore,
        brief: financeBrief.guard.brief,
      }
    : null;

  // Headline deterministik.
  const points: string[] = [];
  points.push(`Revenue ${idrCompact(revenue)} (${orderCount} order).`);
  points.push(`Expense ${idrCompact(expenseTotal)}, net ${idrCompact(net)}.`);
  if (financeGuard?.level) points.push(`Finance Guard: ${financeGuard.level}.`);
  if (present > 0 || absent > 0) {
    points.push(
      `Kehadiran ${present}/${totalStaff}${lateIn > 0 ? `, ${lateIn} telat` : ""}${absent > 0 ? `, ${absent} belum punch` : ""}.`,
    );
  }
  if (lowStockRows.length > 0) {
    points.push(`${lowStockRows.length} item stok rendah.`);
  }
  if (activeTickets > 0) {
    points.push(
      `Dapur ${activeTickets} tiket aktif${lateTickets > 0 ? `, ${lateTickets} telat` : ""}.`,
    );
  }
  if (approvals?.pending && approvals.pending > 0) {
    points.push(`${approvals.pending} approval menunggu.`);
  }
  const headline = points.join(" ");

  // Action prioritas.
  const recommendedActions: OwnerReportData["recommendedActions"] = [];
  if (net < 0) {
    recommendedActions.push({
      label: `Net harian negatif (${idrCompact(net)}) — tinjau pengeluaran`,
      severity: "danger",
    });
  }
  if (lateIn > 0) {
    recommendedActions.push({
      label: `${lateIn} staf telat punch in — tinjau kehadiran`,
      severity: "warn",
    });
  }
  if (lowStockRows.length > 0) {
    recommendedActions.push({
      label: `${lowStockRows.length} item stok rendah — buat reorder`,
      severity: lowStockRows.length > 5 ? "danger" : "warn",
    });
  }
  if (lateTickets > 0) {
    recommendedActions.push({
      label: `${lateTickets} tiket dapur telat — cek bottleneck`,
      severity: "warn",
    });
  }
  if (approvals?.pendingHighRisk && approvals.pendingHighRisk > 0) {
    recommendedActions.push({
      label: `${approvals.pendingHighRisk} approval HIGH RISK menunggu keputusan`,
      severity: "danger",
    });
  }
  if (audit && audit.criticalToday > 0) {
    recommendedActions.push({
      label: `${audit.criticalToday} event CRITICAL di audit log`,
      severity: "danger",
    });
  }
  if (financeGuard?.level === "critical") {
    recommendedActions.push({
      label: `Finance Guard CRITICAL — score ${financeGuard.healthScore}`,
      severity: "danger",
    });
  }

  return {
    dateText,
    generatedAt: new Date().toISOString(),
    headline,
    pnl: { revenue, orderCount, expenses: expenseTotal, net, avgOrderValue },
    topItems: topItemRows.map((r) => ({
      itemName: r.itemName,
      variantLabel: r.variantLabel,
      qty: Number(r.qty),
      revenue: Number(r.revenue),
    })),
    lowStock: lowStockRows.map((i) => ({
      sku: i.sku,
      name: i.name,
      onHand: Number(i.onHand),
      min: Number(i.min),
      unit: i.unit,
    })),
    attendance: { present, absent, lateIn, totalStaff },
    kitchen: {
      activeTickets,
      lateTickets,
      lateList: lateTicketsRows.map((t) => ({
        ticketNo: t.ticketNo,
        station: t.station,
        status: t.status,
        tableLabel: t.tableLabel,
        elapsed: t.elapsed,
        overBy: t.elapsed - t.targetMinutes,
      })),
    },
    approvals,
    audit,
    financeGuard,
    recommendedActions,
  };
}
