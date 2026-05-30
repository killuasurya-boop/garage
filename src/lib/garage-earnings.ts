import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  earningsFailedQueue,
  kitchenTickets,
  menuItems,
  orders,
  orderItems,
  staffEarningPayouts,
  staffEarnings,
  staffProfiles,
  user,
} from "@/db/schema";

export type EarningsRetryKind =
  | "ticket_ready"
  | "ticket_delivered"
  | "order_paid"
  | "reverse_order";

export async function enqueueFailedEarning(
  kind: EarningsRetryKind,
  payload: Record<string, unknown>,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[earnings] ${kind} failed, enqueuing for retry`, error);
  try {
    await getDb().insert(earningsFailedQueue).values({
      kind,
      payload,
      lastError: message,
    });
  } catch (enqueueError) {
    console.error("[earnings] CRITICAL: failed to enqueue retry", {
      kind,
      payload,
      originalError: message,
      enqueueError,
    });
  }
}

// ─── Cycle ─────────────────────────────────────────────
// Calendar-fix cycles, 5 months each, anchored to BASE_YEAR Jan 1 (UTC).
const CYCLE_BASE_YEAR = 2026;
const CYCLE_LENGTH_MONTHS = 5;

export type EarningCycle = {
  index: number;
  start: Date;
  end: Date; // exclusive
  label: string;
};

const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function utcMonth(year: number, monthIndex0: number) {
  return new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0));
}

export function getCycleForDate(date: Date): EarningCycle {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-11
  const monthsFromBase = (year - CYCLE_BASE_YEAR) * 12 + month;
  const cycleIndex = Math.floor(monthsFromBase / CYCLE_LENGTH_MONTHS);
  const startMonthIndex = cycleIndex * CYCLE_LENGTH_MONTHS;
  const startYear = CYCLE_BASE_YEAR + Math.floor(startMonthIndex / 12);
  const startMonth = ((startMonthIndex % 12) + 12) % 12;
  const start = utcMonth(startYear, startMonth);
  const endMonthIndex = startMonthIndex + CYCLE_LENGTH_MONTHS;
  const endYear = CYCLE_BASE_YEAR + Math.floor(endMonthIndex / 12);
  const endMonth = ((endMonthIndex % 12) + 12) % 12;
  const end = utcMonth(endYear, endMonth);

  // label like "Jan–Mei 2026"
  const lastIncludedMonth = ((startMonth + CYCLE_LENGTH_MONTHS - 1) % 12 + 12) % 12;
  const lastIncludedYear =
    startYear + Math.floor((startMonth + CYCLE_LENGTH_MONTHS - 1) / 12);
  const label =
    startYear === lastIncludedYear
      ? `${monthShort[startMonth]}–${monthShort[lastIncludedMonth]} ${startYear}`
      : `${monthShort[startMonth]} ${startYear}–${monthShort[lastIncludedMonth]} ${lastIncludedYear}`;

  return { index: cycleIndex, start, end, label };
}

export function getCurrentCycle() {
  return getCycleForDate(new Date());
}

// ─── Fee table ─────────────────────────────────────────
export type EarningItemKind =
  | "food"
  | "drink"
  | "packaging"
  | "service"
  | "cashier"
  | "adjustment";
export type EarningEvent =
  | "ticket_ready"
  | "ticket_delivered"
  | "order_paid"
  | "owner_adjustment";

/**
 * Lookup unit fee in IDR per item qty based on the staff role and the
 * earning event. Returns 0 when the role is not eligible.
 */
export function lookupUnitFee(input: {
  role: string;
  itemKind: EarningItemKind;
  event: EarningEvent;
}): number {
  const { role, itemKind, event } = input;

  if (event === "ticket_ready") {
    if (itemKind === "food") {
      if (role === "Koki") return 200;
      if (role === "Asisten Koki") return 200;
      return 0;
    }
    if (itemKind === "drink") {
      if (role === "Barista") return 200;
      if (role === "Kitchen / Barista") return 200;
      return 0;
    }
    if (itemKind === "packaging") return 200;
    return 0;
  }

  if (event === "ticket_delivered") {
    if (itemKind !== "service") return 0;
    if (role === "Waiter 1" || role === "Waiter 2") return 100;
    return 0;
  }

  if (event === "order_paid") {
    if (itemKind !== "cashier") return 0;
    if (role === "Kasir") return 200;
    return 0;
  }

  return 0;
}

async function resolveEarningStaff(input: {
  actorUserId: string;
  actorRole: string;
  outletId: string | null;
  eligibleRoles: string[];
}) {
  if (input.eligibleRoles.includes(input.actorRole)) {
    return {
      staffUserId: input.actorUserId,
      staffRole: input.actorRole,
    };
  }

  const db = getDb();
  const rows = await db
    .select({
      staffUserId: user.id,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(
      and(
        inArray(staffProfiles.role, input.eligibleRoles),
        input.outletId ? eq(staffProfiles.outletId, input.outletId) : undefined,
      ),
    );

  for (const role of input.eligibleRoles) {
    const match = rows.find((row) => row.role === role);
    if (match) {
      return {
        staffUserId: match.staffUserId,
        staffRole: match.role,
      };
    }
  }

  return null;
}

async function resolveEarningStaffRecipients(input: {
  actorUserId: string;
  actorRole: string;
  outletId: string | null;
  eligibleRoles: string[];
}) {
  const db = getDb();
  const rows = await db
    .select({
      staffUserId: user.id,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(
      and(
        inArray(staffProfiles.role, input.eligibleRoles),
        input.outletId ? eq(staffProfiles.outletId, input.outletId) : undefined,
      ),
    );

  const recipients = [];
  const seen = new Set<string>();

  for (const role of input.eligibleRoles) {
    const match = rows.find((row) => row.role === role);
    if (match && !seen.has(match.staffUserId)) {
      seen.add(match.staffUserId);
      recipients.push({
        staffUserId: match.staffUserId,
        staffRole: match.role,
      });
    }
  }

  if (recipients.length) {
    return recipients;
  }

  if (input.eligibleRoles.includes(input.actorRole)) {
    return [
      {
        staffUserId: input.actorUserId,
        staffRole: input.actorRole,
      },
    ];
  }

  return [];
}

export async function createOwnerAdjustment(input: {
  staffUserId: string;
  outletId: string | null;
  amount: number;
  note?: string | null;
}) {
  const db = getDb();
  const [profile] = await db
    .select({
      staffUserId: user.id,
      name: user.name,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(eq(user.id, input.staffUserId))
    .limit(1);

  if (!profile) return { row: null, reason: "STAFF_NOT_FOUND" as const };

  const earnedAt = new Date();
  earnedAt.setUTCMonth(earnedAt.getUTCMonth() - WALLET_LOCK_MONTHS);
  earnedAt.setUTCDate(earnedAt.getUTCDate() - 1);
  const cycle = getCycleForDate(earnedAt);
  const note = input.note?.trim() || "Koreksi saldo oleh Owner";

  const [row] = await db
    .insert(staffEarnings)
    .values({
      staffUserId: profile.staffUserId,
      outletId: input.outletId,
      ticketId: null,
      orderId: null,
      orderItemId: null,
      itemKind: "adjustment",
      role: profile.role,
      event: "owner_adjustment",
      qty: 1,
      unitFee: input.amount,
      amount: input.amount,
      status: "accrued",
      payoutId: null,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      earnedAt,
      reverseReason: note,
    })
    .returning();

  return { row, reason: null };
}

export function itemKindForStation(station: string | null | undefined): EarningItemKind | null {
  if (!station) return null;
  const s = station.toLowerCase();
  if (s === "bar") return "drink";
  if (s === "food") return "food";
  if (s === "packaging") return "packaging";
  return null;
}

export function itemKindForCategory(category: string | null | undefined): EarningItemKind {
  if (!category) return "food";
  if (category === "Coffee" || category === "Non-Coffee") return "drink";
  return "food";
}

// ─── Record earnings on ready ──────────────────────────
type RecordTicketReadyInput = {
  ticketId: string;
  staffUserId: string;
  staffRole: string;
  outletId: string | null;
  earnedAt?: Date;
};

/**
 * Create accrued staff_earnings rows for every order_item linked to this
 * kitchen ticket. Skips if any earning already exists for this ticket
 * (idempotent re-trigger when status flips back-and-forth).
 */
export async function recordTicketReadyEarnings(input: RecordTicketReadyInput) {
  const db = getDb();
  const earnedAt = input.earnedAt ?? new Date();
  const cycle = getCycleForDate(earnedAt);

  const [ticket] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.id, input.ticketId))
    .limit(1);
  if (!ticket || !ticket.orderId) return [];

  const ticketKind = itemKindForStation(ticket.station);
  if (!ticketKind) return [];

  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, ticket.orderId))
    .limit(1);
  if (!order || ["rejected", "cancelled", "canceled", "void", "refunded"].includes(order.status)) {
    return [];
  }

  const recipients =
    ticketKind === "food"
      ? await resolveEarningStaffRecipients({
          actorUserId: input.staffUserId,
          actorRole: input.staffRole,
          outletId: input.outletId,
          eligibleRoles: ["Koki", "Asisten Koki"],
        })
      : await (async () => {
          const earningStaff = await resolveEarningStaff({
            actorUserId: input.staffUserId,
            actorRole: input.staffRole,
            outletId: input.outletId,
            eligibleRoles:
              ticketKind === "drink"
                ? ["Barista", "Kitchen / Barista"]
                : ["Koki", "Barista", "Kitchen / Barista"],
          });
          return earningStaff ? [earningStaff] : [];
        })();
  if (!recipients.length) return [];

  const itemsForOrder = await db
    .select({
      id: orderItems.id,
      qty: orderItems.qty,
      menuItemId: orderItems.menuItemId,
      category: menuItems.category,
    })
    .from(orderItems)
    .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orderItems.orderId, ticket.orderId));

  const matchingItems = itemsForOrder.filter((row) => {
    const kind = itemKindForCategory(row.category);
    return kind === ticketKind;
  });
  if (!matchingItems.length) return [];

  const existingRows = await db
    .select({
      staffUserId: staffEarnings.staffUserId,
      orderItemId: staffEarnings.orderItemId,
      role: staffEarnings.role,
    })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.ticketId, input.ticketId),
        eq(staffEarnings.event, "ticket_ready"),
        eq(staffEarnings.status, "accrued"),
      ),
    );
  const existingKeys = new Set(
    existingRows.map((row) => `${row.staffUserId}:${row.orderItemId ?? ""}:${row.role ?? ""}`),
  );

  const rows = matchingItems.flatMap((item) =>
    recipients.flatMap((recipient) => {
      const key = `${recipient.staffUserId}:${item.id}:${recipient.staffRole}`;
      if (existingKeys.has(key)) return [];

      const unitFee = lookupUnitFee({
        role: recipient.staffRole,
        itemKind: ticketKind,
        event: "ticket_ready",
      });
      if (unitFee <= 0) return [];

      return {
        staffUserId: recipient.staffUserId,
        outletId: input.outletId ?? null,
        ticketId: ticket.id,
        orderId: ticket.orderId,
        orderItemId: item.id,
        itemKind: ticketKind,
        role: recipient.staffRole,
        event: "ticket_ready" as const,
        qty: item.qty,
        unitFee,
        amount: unitFee * item.qty,
        status: "accrued" as const,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        earnedAt,
      };
    }),
  );
  if (!rows.length) return [];

  const inserted = await db.insert(staffEarnings).values(rows).returning();
  return inserted;
}

// ─── Record waiter earning on delivered ─────────────────
type RecordTicketDeliveredInput = {
  ticketId: string;
  staffUserId: string;
  staffRole: string;
  outletId: string | null;
  earnedAt?: Date;
};

export async function recordTicketDeliveredEarnings(input: RecordTicketDeliveredInput) {
  const db = getDb();
  const earnedAt = input.earnedAt ?? new Date();
  const cycle = getCycleForDate(earnedAt);

  const earningStaff = await resolveEarningStaff({
    actorUserId: input.staffUserId,
    actorRole: input.staffRole,
    outletId: input.outletId,
    eligibleRoles: ["Waiter 1", "Waiter 2"],
  });
  if (!earningStaff) return [];

  const unitFee = lookupUnitFee({
    role: earningStaff.staffRole,
    itemKind: "service",
    event: "ticket_delivered",
  });
  if (unitFee <= 0) return [];

  // Idempotent: skip if waiter already credited this ticket
  const existing = await db
    .select({ id: staffEarnings.id })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.ticketId, input.ticketId),
        eq(staffEarnings.event, "ticket_delivered"),
      ),
    )
    .limit(1);
  if (existing.length) return [];

  const [ticket] = await db
    .select()
    .from(kitchenTickets)
    .where(eq(kitchenTickets.id, input.ticketId))
    .limit(1);
  if (!ticket || !ticket.orderId) return [];

  const items = await db
    .select({ id: orderItems.id, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, ticket.orderId));
  if (!items.length) return [];

  const rows = items.map((item) => ({
    staffUserId: earningStaff.staffUserId,
    outletId: input.outletId ?? null,
    ticketId: ticket.id,
    orderId: ticket.orderId,
    orderItemId: item.id,
    itemKind: "service" as const,
    role: earningStaff.staffRole,
    event: "ticket_delivered" as const,
    qty: item.qty,
    unitFee,
    amount: unitFee * item.qty,
    status: "accrued" as const,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    earnedAt,
  }));

  return db.insert(staffEarnings).values(rows).returning();
}

// ─── Record kasir earning on order paid ─────────────────
type RecordOrderPaidInput = {
  orderId: string;
  staffUserId: string;
  staffRole: string;
  outletId: string | null;
  earnedAt?: Date;
};

export async function recordOrderPaidEarnings(input: RecordOrderPaidInput) {
  const db = getDb();
  const earnedAt = input.earnedAt ?? new Date();
  const cycle = getCycleForDate(earnedAt);

  const earningStaff = await resolveEarningStaff({
    actorUserId: input.staffUserId,
    actorRole: input.staffRole,
    outletId: input.outletId,
    eligibleRoles: ["Kasir"],
  });
  if (!earningStaff) return [];

  const unitFee = lookupUnitFee({
    role: earningStaff.staffRole,
    itemKind: "cashier",
    event: "order_paid",
  });
  if (unitFee <= 0) return [];

  // Idempotent: skip if kasir already credited this order
  const existing = await db
    .select({ id: staffEarnings.id })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.orderId, input.orderId),
        eq(staffEarnings.event, "order_paid"),
      ),
    )
    .limit(1);
  if (existing.length) return [];

  const items = await db
    .select({ id: orderItems.id, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, input.orderId));
  if (!items.length) return [];

  const rows = items.map((item) => ({
    staffUserId: earningStaff.staffUserId,
    outletId: input.outletId ?? null,
    ticketId: null,
    orderId: input.orderId,
    orderItemId: item.id,
    itemKind: "cashier" as const,
    role: earningStaff.staffRole,
    event: "order_paid" as const,
    qty: item.qty,
    unitFee,
    amount: unitFee * item.qty,
    status: "accrued" as const,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    earnedAt,
  }));

  return db.insert(staffEarnings).values(rows).returning();
}

// ─── Reverse earnings on cancel/refund ─────────────────
type ReverseOrderInput = {
  orderId: string;
  reason: string;
};

export async function reverseEarningsForOrder(input: ReverseOrderInput) {
  const db = getDb();
  const rows = await db
    .update(staffEarnings)
    .set({
      status: "reversed",
      reversedAt: new Date(),
      reverseReason: input.reason,
    })
    .where(
      and(
        eq(staffEarnings.orderId, input.orderId),
        eq(staffEarnings.status, "accrued"),
        isNull(staffEarnings.payoutId),
      ),
    )
    .returning({ id: staffEarnings.id });
  return rows;
}

// ─── Summary ───────────────────────────────────────────
export type StaffEarningSummary = {
  cycle: EarningCycle;
  totalAccrued: number; // current cycle, status=accrued
  totalReversed: number; // current cycle
  totalPaid: number; // lifetime paid
  itemCountFood: number;
  itemCountDrink: number;
  itemCountPackaging: number;
  itemCountService: number;
  itemCountCashier: number;
  pendingPayout: {
    id: string;
    status: string;
    totalAmount: number;
    cycleStart: Date;
    cycleEnd: Date;
  } | null;
};

// ─── KANTONG KARYAWAN — Wallet dengan Lock 5 Bulan ──────────
// Setiap earning ter-lock 5 bulan dari earnedAt. Setelah lewat,
// staff bisa request tarik. Lock duration constant untuk Phase 1;
// di future bisa di-config per role di tabel staff_fee_rates.
//
// Tidak butuh column baru — computed dari earnedAt + interval di SQL.
// ────────────────────────────────────────────────────────────

export const WALLET_LOCK_MONTHS = 5;

export type WalletBreakdownGroup = {
  monthKey: string; // "2026-10"
  monthLabel: string; // "Okt 2026"
  amount: number;
  count: number;
  earliestAvailableAt: string;
};

export type StaffWalletBalance = {
  staffUserId: string;
  lockMonths: number;
  availableBalance: number;
  availableCount: number;
  lockedBalance: number;
  lockedCount: number;
  todayEarned: number;
  todayCount: number;
  thisWeekEarned: number;
  totalPaid: number;
  totalReversed: number;
  // Grouped by month-when-it-becomes-available
  lockedBreakdown: WalletBreakdownGroup[];
  // Earliest unlock date dari yang masih locked
  nextUnlockAt: string | null;
};

export async function getStaffWalletBalance(staffUserId: string): Promise<StaffWalletBalance> {
  const db = getDb();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  // Compute availableAt = earned_at + 5 months in SQL via interval
  const availableAtExpr = sql<Date>`${staffEarnings.earnedAt} + INTERVAL '${sql.raw(String(WALLET_LOCK_MONTHS))} months'`;

  // Single query untuk semua aggregate yang dibutuhkan
  const rows = await db
    .select({
      status: staffEarnings.status,
      amount: staffEarnings.amount,
      earnedAt: staffEarnings.earnedAt,
      availableAt: availableAtExpr,
    })
    .from(staffEarnings)
    .where(eq(staffEarnings.staffUserId, staffUserId));

  let availableBalance = 0;
  let availableCount = 0;
  let lockedBalance = 0;
  let lockedCount = 0;
  let todayEarned = 0;
  let todayCount = 0;
  let thisWeekEarned = 0;
  let totalPaid = 0;
  let totalReversed = 0;
  const lockedByMonth = new Map<
    string,
    { amount: number; count: number; earliestAvailableAt: Date }
  >();
  let nextUnlockAt: Date | null = null;

  for (const row of rows) {
    const earnedAt = new Date(row.earnedAt);
    const availableAt = new Date(row.availableAt);
    const amount = row.amount;

    if (row.status === "paid") {
      totalPaid += amount;
      continue;
    }
    if (row.status === "reversed") {
      totalReversed += amount;
      continue;
    }
    if (row.status !== "accrued") continue;

    // Today earn (gross — termasuk locked)
    if (earnedAt >= todayStart) {
      todayEarned += amount;
      todayCount += 1;
    }
    if (earnedAt >= weekStart) {
      thisWeekEarned += amount;
    }

    // Available vs Locked
    if (availableAt <= now) {
      availableBalance += amount;
      availableCount += 1;
    } else {
      lockedBalance += amount;
      lockedCount += 1;

      const monthKey = `${availableAt.getFullYear()}-${String(availableAt.getMonth() + 1).padStart(2, "0")}`;
      const existing = lockedByMonth.get(monthKey);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
        if (availableAt < existing.earliestAvailableAt) {
          existing.earliestAvailableAt = availableAt;
        }
      } else {
        lockedByMonth.set(monthKey, {
          amount,
          count: 1,
          earliestAvailableAt: availableAt,
        });
      }

      if (!nextUnlockAt || availableAt < nextUnlockAt) {
        nextUnlockAt = availableAt;
      }
    }
  }

  const lockedBreakdown: WalletBreakdownGroup[] = Array.from(lockedByMonth.entries())
    .map(([monthKey, data]) => {
      const [year, month] = monthKey.split("-").map(Number);
      return {
        monthKey,
        monthLabel: `${monthShort[month - 1]} ${year}`,
        amount: data.amount,
        count: data.count,
        earliestAvailableAt: data.earliestAvailableAt.toISOString(),
      };
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  return {
    staffUserId,
    lockMonths: WALLET_LOCK_MONTHS,
    availableBalance,
    availableCount,
    lockedBalance,
    lockedCount,
    todayEarned,
    todayCount,
    thisWeekEarned,
    totalPaid,
    totalReversed,
    lockedBreakdown,
    nextUnlockAt: nextUnlockAt?.toISOString() ?? null,
  };
}

export async function getStaffEarningSummary(staffUserId: string): Promise<StaffEarningSummary> {
  const db = getDb();
  const cycle = getCurrentCycle();

  const cycleRows = await db
    .select({
      itemKind: staffEarnings.itemKind,
      status: staffEarnings.status,
      qty: sql<number>`coalesce(sum(${staffEarnings.qty}), 0)`,
      amount: sql<number>`coalesce(sum(${staffEarnings.amount}), 0)`,
    })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.staffUserId, staffUserId),
        gte(staffEarnings.earnedAt, cycle.start),
        lt(staffEarnings.earnedAt, cycle.end),
      ),
    )
    .groupBy(staffEarnings.itemKind, staffEarnings.status);

  let totalAccrued = 0;
  let totalReversed = 0;
  const kindCount: Record<EarningItemKind, number> = {
    food: 0,
    drink: 0,
    packaging: 0,
    service: 0,
    cashier: 0,
    adjustment: 0,
  };

  for (const row of cycleRows) {
    const amount = Number(row.amount) || 0;
    const qty = Number(row.qty) || 0;
    const kind = (row.itemKind as EarningItemKind) ?? "food";
    if (row.status === "accrued") {
      totalAccrued += amount;
      kindCount[kind] += qty;
    } else if (row.status === "reversed") {
      totalReversed += amount;
    }
  }

  const [paidSumRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${staffEarnings.amount}), 0)`,
    })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.staffUserId, staffUserId),
        eq(staffEarnings.status, "paid"),
      ),
    );
  const totalPaid = Number(paidSumRow?.total ?? 0);

  const [pending] = await db
    .select()
    .from(staffEarningPayouts)
    .where(
      and(
        eq(staffEarningPayouts.staffUserId, staffUserId),
        inArray(staffEarningPayouts.status, ["pending", "approved"]),
      ),
    )
    .orderBy(desc(staffEarningPayouts.createdAt))
    .limit(1);

  return {
    cycle,
    totalAccrued,
    totalReversed,
    totalPaid,
    itemCountFood: kindCount.food,
    itemCountDrink: kindCount.drink,
    itemCountPackaging: kindCount.packaging,
    itemCountService: kindCount.service,
    itemCountCashier: kindCount.cashier,
    pendingPayout: pending
      ? {
          id: pending.id,
          status: pending.status,
          totalAmount: pending.totalAmount,
          cycleStart: pending.cycleStart,
          cycleEnd: pending.cycleEnd,
        }
      : null,
  };
}

// ─── List earnings (history) ───────────────────────────
export async function listStaffEarnings(staffUserId: string, limit = 100) {
  const db = getDb();
  return db
    .select({
      id: staffEarnings.id,
      itemKind: staffEarnings.itemKind,
      event: staffEarnings.event,
      role: staffEarnings.role,
      qty: staffEarnings.qty,
      unitFee: staffEarnings.unitFee,
      amount: staffEarnings.amount,
      status: staffEarnings.status,
      cycleStart: staffEarnings.cycleStart,
      cycleEnd: staffEarnings.cycleEnd,
      earnedAt: staffEarnings.earnedAt,
      orderId: staffEarnings.orderId,
      orderNo: orders.orderNo,
      tableLabel: orders.tableLabel,
      ticketId: staffEarnings.ticketId,
      ticketNo: kitchenTickets.ticketNo,
      station: kitchenTickets.station,
    })
    .from(staffEarnings)
    .leftJoin(orders, eq(staffEarnings.orderId, orders.id))
    .leftJoin(kitchenTickets, eq(staffEarnings.ticketId, kitchenTickets.id))
    .where(eq(staffEarnings.staffUserId, staffUserId))
    .orderBy(desc(staffEarnings.earnedAt))
    .limit(limit);
}

// ─── Payout (close cycle, request, approve, pay) ───────
export async function closeCycleForStaff(input: {
  staffUserId: string;
  cycle: EarningCycle;
  outletId: string | null;
  requestedBy: string | null;
}) {
  const db = getDb();

  const availableCutoff = new Date();
  availableCutoff.setUTCMonth(availableCutoff.getUTCMonth() - WALLET_LOCK_MONTHS);

  // Only earnings older than the 5-month lock period can be pulled into a payout.
  const accrued = await db
    .select({
      id: staffEarnings.id,
      itemKind: staffEarnings.itemKind,
      amount: staffEarnings.amount,
      qty: staffEarnings.qty,
      cycleStart: staffEarnings.cycleStart,
      cycleEnd: staffEarnings.cycleEnd,
    })
    .from(staffEarnings)
    .where(
      and(
        eq(staffEarnings.staffUserId, input.staffUserId),
        eq(staffEarnings.status, "accrued"),
        isNull(staffEarnings.payoutId),
        lte(staffEarnings.earnedAt, availableCutoff),
      ),
    );
  if (!accrued.length) return null;

  let foodQty = 0;
  let drinkQty = 0;
  let packagingQty = 0;
  let serviceQty = 0;
  let cashierQty = 0;
  let total = 0;
  let cycleStart = accrued[0]?.cycleStart ?? input.cycle.start;
  let cycleEnd = accrued[0]?.cycleEnd ?? input.cycle.end;
  for (const row of accrued) {
    total += row.amount;
    if (row.cycleStart < cycleStart) cycleStart = row.cycleStart;
    if (row.cycleEnd > cycleEnd) cycleEnd = row.cycleEnd;
    if (row.itemKind === "food") foodQty += row.qty;
    else if (row.itemKind === "drink") drinkQty += row.qty;
    else if (row.itemKind === "packaging") packagingQty += row.qty;
    else if (row.itemKind === "service") serviceQty += row.qty;
    else if (row.itemKind === "cashier") cashierQty += row.qty;
  }

  if (total <= 0) return null;

  const [payout] = await db
    .insert(staffEarningPayouts)
    .values({
      staffUserId: input.staffUserId,
      outletId: input.outletId,
      cycleStart,
      cycleEnd,
      itemCountFood: foodQty,
      itemCountDrink: drinkQty,
      itemCountPackaging: packagingQty,
      itemCountService: serviceQty,
      itemCountCashier: cashierQty,
      totalAmount: total,
      status: "pending",
      requestedBy: input.requestedBy,
    })
    .returning();

  await db
    .update(staffEarnings)
    .set({ payoutId: payout.id })
    .where(
      inArray(
        staffEarnings.id,
        accrued.map((row) => row.id),
      ),
    );

  return payout;
}

export async function autoCreateEligiblePayouts(input: {
  outletId: string | null;
  requestedBy: string | null;
}) {
  const db = getDb();
  const cycle = getCurrentCycle();
  const profiles = await db
    .select({
      staffUserId: user.id,
      name: user.name,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .orderBy(asc(user.name));

  const created = [];
  let skippedActive = 0;
  let skippedLocked = 0;

  for (const profile of profiles) {
    const [activePayout] = await db
      .select({ id: staffEarningPayouts.id })
      .from(staffEarningPayouts)
      .where(
        and(
          eq(staffEarningPayouts.staffUserId, profile.staffUserId),
          inArray(staffEarningPayouts.status, ["pending", "approved"]),
        ),
      )
      .limit(1);

    if (activePayout) {
      skippedActive += 1;
      continue;
    }

    const payout = await closeCycleForStaff({
      staffUserId: profile.staffUserId,
      cycle,
      outletId: input.outletId,
      requestedBy: input.requestedBy,
    });

    if (payout) {
      created.push({
        id: payout.id,
        staffUserId: profile.staffUserId,
        staffName: profile.name,
        totalAmount: payout.totalAmount,
      });
    } else {
      skippedLocked += 1;
    }
  }

  return {
    createdCount: created.length,
    skippedActive,
    skippedLocked,
    payouts: created,
  };
}

export async function approvePayout(payoutId: string, approverUserId: string, note?: string) {
  const db = getDb();
  const [row] = await db
    .update(staffEarningPayouts)
    .set({
      status: "approved",
      approvedBy: approverUserId,
      approvedAt: new Date(),
      note: note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(staffEarningPayouts.id, payoutId), eq(staffEarningPayouts.status, "pending")),
    )
    .returning();
  return row ?? null;
}

export async function markPayoutPaid(input: {
  payoutId: string;
  paidByUserId: string;
  paymentRef?: string;
  note?: string;
}) {
  const db = getDb();
  const [row] = await db
    .update(staffEarningPayouts)
    .set({
      status: "paid",
      paidBy: input.paidByUserId,
      paidAt: new Date(),
      paymentRef: input.paymentRef ?? null,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(staffEarningPayouts.id, input.payoutId), eq(staffEarningPayouts.status, "approved")),
    )
    .returning();
  if (!row) return null;

  // Flip linked earnings to paid.
  await db
    .update(staffEarnings)
    .set({ status: "paid" })
    .where(eq(staffEarnings.payoutId, row.id));
  return row;
}

export async function cancelPayout(payoutId: string, cancelledByUserId: string, note?: string) {
  const db = getDb();
  const [row] = await db
    .update(staffEarningPayouts)
    .set({
      status: "cancelled",
      note: note ?? `Cancelled by ${cancelledByUserId}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(staffEarningPayouts.id, payoutId),
        inArray(staffEarningPayouts.status, ["pending", "approved"]),
      ),
    )
    .returning();
  if (!row) return null;

  await db
    .update(staffEarnings)
    .set({ payoutId: null })
    .where(eq(staffEarnings.payoutId, row.id));

  return row;
}

export async function listPayouts(filter?: { status?: string; staffUserId?: string }) {
  const db = getDb();
  const where = [];
  if (filter?.status) where.push(eq(staffEarningPayouts.status, filter.status));
  if (filter?.staffUserId) where.push(eq(staffEarningPayouts.staffUserId, filter.staffUserId));
  return db
    .select({
      id: staffEarningPayouts.id,
      staffUserId: staffEarningPayouts.staffUserId,
      staffName: user.name,
      staffEmail: user.email,
      staffRole: staffProfiles.role,
      cycleStart: staffEarningPayouts.cycleStart,
      cycleEnd: staffEarningPayouts.cycleEnd,
      itemCountFood: staffEarningPayouts.itemCountFood,
      itemCountDrink: staffEarningPayouts.itemCountDrink,
      itemCountPackaging: staffEarningPayouts.itemCountPackaging,
      itemCountService: staffEarningPayouts.itemCountService,
      itemCountCashier: staffEarningPayouts.itemCountCashier,
      totalAmount: staffEarningPayouts.totalAmount,
      status: staffEarningPayouts.status,
      note: staffEarningPayouts.note,
      paymentRef: staffEarningPayouts.paymentRef,
      approvedAt: staffEarningPayouts.approvedAt,
      paidAt: staffEarningPayouts.paidAt,
      createdAt: staffEarningPayouts.createdAt,
    })
    .from(staffEarningPayouts)
    .innerJoin(user, eq(staffEarningPayouts.staffUserId, user.id))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, staffEarningPayouts.staffUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(staffEarningPayouts.createdAt));
}

export type StaffEarningBalanceRow = {
  staffUserId: string;
  name: string;
  email: string;
  role: string;
  currentCycleAccrued: number;
  currentCycleItemCount: number;
  availableBalance: number;
  lockedBalance: number;
  totalPaid: number;
  activePayoutId: string | null;
  activePayoutStatus: string | null;
  activePayoutAmount: number;
};

export async function listStaffEarningBalances(): Promise<StaffEarningBalanceRow[]> {
  const db = getDb();
  const cycle = getCurrentCycle();
  const profiles = await db
    .select({
      staffUserId: user.id,
      name: user.name,
      email: user.email,
      role: staffProfiles.role,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .orderBy(asc(staffProfiles.role), asc(user.name));

  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const [cycleRow] = await db
        .select({
          amount: sql<number>`coalesce(sum(${staffEarnings.amount}), 0)`,
          qty: sql<number>`coalesce(sum(${staffEarnings.qty}), 0)`,
        })
        .from(staffEarnings)
        .where(
          and(
            eq(staffEarnings.staffUserId, profile.staffUserId),
            eq(staffEarnings.status, "accrued"),
            isNull(staffEarnings.payoutId),
            gte(staffEarnings.earnedAt, cycle.start),
            lt(staffEarnings.earnedAt, cycle.end),
          ),
        );

      const wallet = await getStaffWalletBalance(profile.staffUserId);
      const [activePayout] = await db
        .select({
          id: staffEarningPayouts.id,
          status: staffEarningPayouts.status,
          totalAmount: staffEarningPayouts.totalAmount,
        })
        .from(staffEarningPayouts)
        .where(
          and(
            eq(staffEarningPayouts.staffUserId, profile.staffUserId),
            inArray(staffEarningPayouts.status, ["pending", "approved"]),
          ),
        )
        .orderBy(desc(staffEarningPayouts.createdAt))
        .limit(1);

      return {
        ...profile,
        currentCycleAccrued: Number(cycleRow?.amount ?? 0),
        currentCycleItemCount: Number(cycleRow?.qty ?? 0),
        availableBalance: wallet.availableBalance,
        lockedBalance: wallet.lockedBalance,
        totalPaid: wallet.totalPaid,
        activePayoutId: activePayout?.id ?? null,
        activePayoutStatus: activePayout?.status ?? null,
        activePayoutAmount: activePayout?.totalAmount ?? 0,
      };
    }),
  );

  return rows.sort((a, b) => {
    const byAccrued = b.currentCycleAccrued - a.currentCycleAccrued;
    if (byAccrued !== 0) return byAccrued;
    const byAvailable = b.availableBalance - a.availableBalance;
    if (byAvailable !== 0) return byAvailable;
    return a.name.localeCompare(b.name);
  });
}

// ─── Dead-letter retry ─────────────────────────────────
const EARNINGS_RETRY_MAX_ATTEMPTS = 5;

async function dispatchEarningRetry(kind: string, payload: Record<string, unknown>) {
  const earnedAtRaw = payload.earnedAt;
  const earnedAt =
    typeof earnedAtRaw === "string" || earnedAtRaw instanceof Date
      ? new Date(earnedAtRaw)
      : undefined;
  const outletId = payload.outletId == null ? null : String(payload.outletId);

  switch (kind) {
    case "ticket_ready":
      await recordTicketReadyEarnings({
        ticketId: String(payload.ticketId),
        staffUserId: String(payload.staffUserId),
        staffRole: String(payload.staffRole),
        outletId,
        earnedAt,
      });
      return;
    case "ticket_delivered":
      await recordTicketDeliveredEarnings({
        ticketId: String(payload.ticketId),
        staffUserId: String(payload.staffUserId),
        staffRole: String(payload.staffRole),
        outletId,
        earnedAt,
      });
      return;
    case "order_paid":
      await recordOrderPaidEarnings({
        orderId: String(payload.orderId),
        staffUserId: String(payload.staffUserId),
        staffRole: String(payload.staffRole),
        outletId,
        earnedAt,
      });
      return;
    case "reverse_order":
      await reverseEarningsForOrder({
        orderId: String(payload.orderId),
        reason: String(payload.reason ?? "Retry"),
      });
      return;
    default:
      throw new Error(`Unknown earnings retry kind: ${kind}`);
  }
}

export async function processEarningsRetry(options: { batchSize?: number } = {}) {
  const db = getDb();
  const batchSize = Math.max(1, Math.min(200, options.batchSize ?? 50));

  const pending = await db
    .select()
    .from(earningsFailedQueue)
    .where(
      and(
        isNull(earningsFailedQueue.resolvedAt),
        lt(earningsFailedQueue.attempts, EARNINGS_RETRY_MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(earningsFailedQueue.createdAt))
    .limit(batchSize);

  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    const now = new Date();
    try {
      await dispatchEarningRetry(row.kind, row.payload);
      await db
        .update(earningsFailedQueue)
        .set({
          attempts: row.attempts + 1,
          lastTriedAt: now,
          lastError: null,
          resolvedAt: now,
        })
        .where(eq(earningsFailedQueue.id, row.id));
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(earningsFailedQueue)
        .set({
          attempts: row.attempts + 1,
          lastTriedAt: now,
          lastError: message,
        })
        .where(eq(earningsFailedQueue.id, row.id));
      failed += 1;
    }
  }

  const [abandonedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(earningsFailedQueue)
    .where(
      and(
        isNull(earningsFailedQueue.resolvedAt),
        gte(earningsFailedQueue.attempts, EARNINGS_RETRY_MAX_ATTEMPTS),
      ),
    );

  return {
    processed: pending.length,
    succeeded,
    failed,
    abandoned: Number(abandonedRow?.count ?? 0),
    maxAttempts: EARNINGS_RETRY_MAX_ATTEMPTS,
  };
}
