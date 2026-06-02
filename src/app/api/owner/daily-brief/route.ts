import { and, gte, lt, sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import {
  employeeAttendances,
  inventoryItems,
  kitchenTickets,
  orders,
  staffProfiles,
} from "@/db/schema";
import {
  getApprovalStats,
  getAuditStats,
  getFinanceBrief,
} from "@/lib/garage-service";
import { jakartaDayRange } from "@/lib/attendance";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily Owner Brief: ringkasan cross-domain dalam 1 panggilan API.
// Dipakai oleh halaman /control/briefing dan widget di Owner Snapshot.
export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  try {
    const db = await getDb();
    const { start, end } = jakartaDayRange();

    // Jalankan paralel — masing-masing independen.
    const [
      financeBrief,
      approvals,
      audit,
      lowStockRows,
      activeTickets,
      lateTicketsRows,
      attendanceToday,
      staffActiveCount,
    ] = await Promise.all([
      getFinanceBrief().catch(() => null),
      getApprovalStats().catch(() => null),
      getAuditStats().catch(() => null),
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
        .limit(10),
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
          timestamp: employeeAttendances.timestamp,
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
    ]);

    // Hitung kehadiran unik & telat.
    const lastByStaff = new Map<string, { action: string; status: string | null }>();
    let lateIn = 0;
    for (const a of attendanceToday) {
      if (a.action === "in" && a.status === "late") lateIn += 1;
      const key = a.staffId ?? "";
      const prev = lastByStaff.get(key);
      const cur = { action: a.action, status: a.status };
      if (!prev) lastByStaff.set(key, cur);
    }
    const present = lastByStaff.size;
    const totalStaff = Number(staffActiveCount[0]?.total ?? 0);
    const absent = Math.max(0, totalStaff - present);

    const todayRevenueRow = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
          sql`${orders.status} = 'paid'`,
        ),
      );
    const todayRevenue = Number(todayRevenueRow[0]?.total ?? 0);

    // Susun headline sederhana (tanpa LLM — deterministik, cepat, gratis).
    const idr = (n: number) => {
      if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
      if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} rb`;
      return `Rp ${Math.round(n)}`;
    };

    const points: string[] = [];
    points.push(`Revenue hari ini ${idr(todayRevenue)}.`);
    if (financeBrief?.guard?.level) {
      points.push(`Finance Guard: ${financeBrief.guard.level}.`);
    }
    if (present > 0 || absent > 0) {
      points.push(
        `Kehadiran ${present}/${totalStaff} aktif${lateIn > 0 ? `, ${lateIn} telat` : ""}${absent > 0 ? `, ${absent} belum punch` : ""}.`,
      );
    }
    if (lowStockRows.length > 0) {
      points.push(
        `${lowStockRows.length} item stok rendah${lowStockRows.length <= 3 ? `: ${lowStockRows.map((i) => i.name).join(", ")}` : ""}.`,
      );
    }
    const lateTicketCount = Number(lateTicketsRows.length);
    const activeTicketCount = Number(activeTickets[0]?.total ?? 0);
    if (activeTicketCount > 0) {
      points.push(
        `Dapur ${activeTicketCount} tiket aktif${lateTicketCount > 0 ? `, ${lateTicketCount} telat` : ""}.`,
      );
    }
    if (approvals?.pending && approvals.pending > 0) {
      points.push(
        `${approvals.pending} approval menunggu${approvals.pendingHighRisk ? `, ${approvals.pendingHighRisk} high-risk` : ""}.`,
      );
    }
    if (audit && (audit.criticalToday > 0 || audit.warningsToday > 0)) {
      points.push(
        `Audit: ${audit.criticalToday} kritis, ${audit.warningsToday} warning.`,
      );
    }

    const headline = points.join(" ");

    // Action prioritas yang diturunkan dari sinyal.
    const recommendedActions: Array<{
      label: string;
      severity: "info" | "warn" | "danger";
      href?: string;
    }> = [];
    if (lateIn > 0) {
      recommendedActions.push({
        label: `Tinjau ${lateIn} staf yang telat punch in`,
        severity: "warn",
        href: "/control/cash-closing",
      });
    }
    if (lowStockRows.length > 0) {
      recommendedActions.push({
        label: `${lowStockRows.length} item stok rendah — buat reorder`,
        severity: lowStockRows.length > 5 ? "danger" : "warn",
        href: "/control/inventory-intel",
      });
    }
    if (lateTicketCount > 0) {
      recommendedActions.push({
        label: `${lateTicketCount} tiket dapur telat — cek bottleneck`,
        severity: "warn",
        href: "/control/kitchen-ops",
      });
    }
    if (approvals?.pendingHighRisk && approvals.pendingHighRisk > 0) {
      recommendedActions.push({
        label: `${approvals.pendingHighRisk} approval HIGH RISK menunggu keputusan`,
        severity: "danger",
        href: "/control",
      });
    }
    if (audit && audit.criticalToday > 0) {
      recommendedActions.push({
        label: `${audit.criticalToday} event CRITICAL di audit log`,
        severity: "danger",
        href: "/control",
      });
    }
    if (financeBrief?.guard?.level === "critical") {
      recommendedActions.push({
        label: `Finance Guard CRITICAL — score ${financeBrief.guard.healthScore}`,
        severity: "danger",
        href: "/control/cashflow",
      });
    }

    return ok({
      generatedAt: new Date().toISOString(),
      headline,
      revenueToday: todayRevenue,
      finance: financeBrief,
      attendance: {
        present,
        absent,
        lateIn,
        totalStaff,
      },
      inventory: {
        lowCount: lowStockRows.length,
        lowItems: lowStockRows.map((i) => ({
          sku: i.sku,
          name: i.name,
          onHand: i.onHand,
          min: i.min,
          unit: i.unit,
        })),
      },
      kitchen: {
        activeTickets: activeTicketCount,
        lateTickets: lateTicketCount,
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
      recommendedActions,
    });
  } catch (error) {
    console.error("owner/daily-brief error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menyusun briefing harian");
  }
}
