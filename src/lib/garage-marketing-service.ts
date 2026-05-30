import { randomBytes } from "crypto";

import { and, asc, count, desc, eq, gte, ilike, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  crmCampaignLogs,
  customers,
  marketingBroadcasts,
  marketingCampaigns,
  vouchers,
  voucherRedemptions,
} from "@/db/schema";

export type MarketingCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type MarketingBroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled";

export type MarketingChannel = "whatsapp" | "instagram" | "in_store" | "multi";

export type MarketingObjective =
  | "winback"
  | "acquisition"
  | "retention"
  | "awareness"
  | "loyalty";

const VALID_CAMPAIGN_STATUSES: MarketingCampaignStatus[] = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "archived",
];

const VALID_BROADCAST_STATUSES: MarketingBroadcastStatus[] = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
];

const VALID_CHANNELS: MarketingChannel[] = [
  "whatsapp",
  "instagram",
  "in_store",
  "multi",
];

const VALID_OBJECTIVES: MarketingObjective[] = [
  "winback",
  "acquisition",
  "retention",
  "awareness",
  "loyalty",
];

export type MarketingCampaignRow = typeof marketingCampaigns.$inferSelect;
export type MarketingBroadcastRow = typeof marketingBroadcasts.$inferSelect;

function generateCampaignCode() {
  const yy = new Date().getFullYear().toString().slice(-2);
  const rnd = randomBytes(3).toString("base64url").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4);
  return `MKT-${yy}-${rnd}`;
}

function ensureCampaignStatus(value: string | undefined): MarketingCampaignStatus {
  if (value && (VALID_CAMPAIGN_STATUSES as string[]).includes(value)) {
    return value as MarketingCampaignStatus;
  }
  return "draft";
}

function ensureBroadcastStatus(value: string | undefined): MarketingBroadcastStatus {
  if (value && (VALID_BROADCAST_STATUSES as string[]).includes(value)) {
    return value as MarketingBroadcastStatus;
  }
  return "scheduled";
}

function ensureChannel(value: string | undefined): MarketingChannel {
  if (value && (VALID_CHANNELS as string[]).includes(value)) {
    return value as MarketingChannel;
  }
  return "whatsapp";
}

function ensureObjective(value: string | undefined): MarketingObjective {
  if (value && (VALID_OBJECTIVES as string[]).includes(value)) {
    return value as MarketingObjective;
  }
  return "retention";
}

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function serializeCampaign(
  row: MarketingCampaignRow,
  extras?: { voucherCode?: string | null; voucherTitle?: string | null },
) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    objective: row.objective,
    channel: row.channel,
    segmentKey: row.segmentKey,
    audienceSize: row.audienceSize,
    budget: row.budget,
    spend: row.spend,
    targetOrders: row.targetOrders,
    targetRevenue: row.targetRevenue,
    actualOrders: row.actualOrders,
    actualRevenue: row.actualRevenue,
    status: row.status as MarketingCampaignStatus,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    ownerName: row.ownerName,
    notes: row.notes,
    voucherId: row.voucherId,
    voucherCode: extras?.voucherCode ?? null,
    voucherTitle: extras?.voucherTitle ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeBroadcast(
  row: MarketingBroadcastRow,
  extras?: { campaignName?: string | null; campaignCode?: string | null },
) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: extras?.campaignName ?? null,
    campaignCode: extras?.campaignCode ?? null,
    name: row.name,
    channel: row.channel,
    segmentKey: row.segmentKey,
    templateBody: row.templateBody,
    status: row.status as MarketingBroadcastStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    totalRecipients: row.totalRecipients,
    sentCount: row.sentCount,
    openedCount: row.openedCount,
    clickedCount: row.clickedCount,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type MarketingCampaignDto = ReturnType<typeof serializeCampaign>;
export type MarketingBroadcastDto = ReturnType<typeof serializeBroadcast>;

export async function listMarketingCampaigns(params?: {
  status?: string;
  channel?: string;
  search?: string;
  limit?: number;
}) {
  const db = getDb();
  const filters = [];
  if (params?.status && params.status !== "all") {
    filters.push(eq(marketingCampaigns.status, params.status));
  }
  if (params?.channel && params.channel !== "all") {
    filters.push(eq(marketingCampaigns.channel, params.channel));
  }
  if (params?.search) {
    filters.push(ilike(marketingCampaigns.name, `%${params.search.trim()}%`));
  }
  const limit = Math.max(1, Math.min(200, params?.limit ?? 100));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      campaign: marketingCampaigns,
      voucherCode: vouchers.code,
      voucherTitle: vouchers.title,
    })
    .from(marketingCampaigns)
    .leftJoin(vouchers, eq(vouchers.id, marketingCampaigns.voucherId))
    .where(where)
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(limit);

  return rows.map((row) =>
    serializeCampaign(row.campaign, {
      voucherCode: row.voucherCode,
      voucherTitle: row.voucherTitle,
    }),
  );
}

export async function getMarketingCampaign(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      campaign: marketingCampaigns,
      voucherCode: vouchers.code,
      voucherTitle: vouchers.title,
    })
    .from(marketingCampaigns)
    .leftJoin(vouchers, eq(vouchers.id, marketingCampaigns.voucherId))
    .where(eq(marketingCampaigns.id, id))
    .limit(1);

  if (!row) return null;
  return serializeCampaign(row.campaign, {
    voucherCode: row.voucherCode,
    voucherTitle: row.voucherTitle,
  });
}

export type CreateMarketingCampaignInput = {
  name: string;
  objective?: string;
  channel?: string;
  segmentKey: string;
  audienceSize?: number;
  budget?: number;
  targetOrders?: number;
  targetRevenue?: number;
  status?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  ownerName?: string | null;
  notes?: string | null;
  voucherId?: string | null;
  createdBy?: string | null;
};

export async function createMarketingCampaign(input: CreateMarketingCampaignInput) {
  const db = getDb();
  const [row] = await db
    .insert(marketingCampaigns)
    .values({
      code: generateCampaignCode(),
      name: input.name.trim(),
      objective: ensureObjective(input.objective),
      channel: ensureChannel(input.channel),
      segmentKey: input.segmentKey,
      audienceSize: Math.max(0, input.audienceSize ?? 0),
      budget: Math.max(0, input.budget ?? 0),
      targetOrders: Math.max(0, input.targetOrders ?? 0),
      targetRevenue: Math.max(0, input.targetRevenue ?? 0),
      status: ensureCampaignStatus(input.status),
      startsAt: parseDateInput(input.startsAt) ?? undefined,
      endsAt: parseDateInput(input.endsAt) ?? undefined,
      ownerName: input.ownerName?.trim() || null,
      notes: input.notes?.trim() || null,
      voucherId: input.voucherId || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return serializeCampaign(row);
}

export type UpdateMarketingCampaignInput = Partial<{
  name: string;
  objective: string;
  channel: string;
  segmentKey: string;
  audienceSize: number;
  budget: number;
  spend: number;
  targetOrders: number;
  targetRevenue: number;
  actualOrders: number;
  actualRevenue: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  ownerName: string | null;
  notes: string | null;
  voucherId: string | null;
}>;

export async function updateMarketingCampaign(id: string, input: UpdateMarketingCampaignInput) {
  const db = getDb();
  const values: Partial<typeof marketingCampaigns.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.objective !== undefined) values.objective = ensureObjective(input.objective);
  if (input.channel !== undefined) values.channel = ensureChannel(input.channel);
  if (input.segmentKey !== undefined) values.segmentKey = input.segmentKey;
  if (input.audienceSize !== undefined) values.audienceSize = Math.max(0, input.audienceSize);
  if (input.budget !== undefined) values.budget = Math.max(0, input.budget);
  if (input.spend !== undefined) values.spend = Math.max(0, input.spend);
  if (input.targetOrders !== undefined) values.targetOrders = Math.max(0, input.targetOrders);
  if (input.targetRevenue !== undefined) values.targetRevenue = Math.max(0, input.targetRevenue);
  if (input.actualOrders !== undefined) values.actualOrders = Math.max(0, input.actualOrders);
  if (input.actualRevenue !== undefined) values.actualRevenue = Math.max(0, input.actualRevenue);
  if (input.status !== undefined) values.status = ensureCampaignStatus(input.status);
  if (input.startsAt !== undefined) values.startsAt = parseDateInput(input.startsAt);
  if (input.endsAt !== undefined) values.endsAt = parseDateInput(input.endsAt);
  if (input.ownerName !== undefined) values.ownerName = input.ownerName?.trim() || null;
  if (input.notes !== undefined) values.notes = input.notes?.trim() || null;
  if (input.voucherId !== undefined) values.voucherId = input.voucherId || null;

  const [row] = await db
    .update(marketingCampaigns)
    .set(values)
    .where(eq(marketingCampaigns.id, id))
    .returning();
  return row ? serializeCampaign(row) : null;
}

export async function archiveMarketingCampaign(id: string) {
  return updateMarketingCampaign(id, { status: "archived" });
}

export async function listMarketingBroadcasts(params?: {
  campaignId?: string;
  status?: string;
  limit?: number;
}) {
  const db = getDb();
  const filters = [];
  if (params?.campaignId) {
    filters.push(eq(marketingBroadcasts.campaignId, params.campaignId));
  }
  if (params?.status && params.status !== "all") {
    filters.push(eq(marketingBroadcasts.status, params.status));
  }
  const limit = Math.max(1, Math.min(200, params?.limit ?? 100));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      broadcast: marketingBroadcasts,
      campaignName: marketingCampaigns.name,
      campaignCode: marketingCampaigns.code,
    })
    .from(marketingBroadcasts)
    .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingBroadcasts.campaignId))
    .where(where)
    .orderBy(desc(marketingBroadcasts.scheduledAt), desc(marketingBroadcasts.createdAt))
    .limit(limit);

  return rows.map((row) =>
    serializeBroadcast(row.broadcast, {
      campaignName: row.campaignName,
      campaignCode: row.campaignCode,
    }),
  );
}

export type CreateMarketingBroadcastInput = {
  campaignId?: string | null;
  name: string;
  channel?: string;
  segmentKey: string;
  templateBody: string;
  status?: string;
  scheduledAt?: string | null;
  totalRecipients?: number;
  notes?: string | null;
  createdBy?: string | null;
};

export async function createMarketingBroadcast(input: CreateMarketingBroadcastInput) {
  const db = getDb();
  const [row] = await db
    .insert(marketingBroadcasts)
    .values({
      campaignId: input.campaignId || null,
      name: input.name.trim(),
      channel: ensureChannel(input.channel),
      segmentKey: input.segmentKey,
      templateBody: input.templateBody.slice(0, 2000),
      status: ensureBroadcastStatus(input.status),
      scheduledAt: parseDateInput(input.scheduledAt) ?? undefined,
      totalRecipients: Math.max(0, input.totalRecipients ?? 0),
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return serializeBroadcast(row);
}

export type UpdateMarketingBroadcastInput = Partial<{
  name: string;
  channel: string;
  segmentKey: string;
  templateBody: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  notes: string | null;
  campaignId: string | null;
}>;

export async function updateMarketingBroadcast(id: string, input: UpdateMarketingBroadcastInput) {
  const db = getDb();
  const values: Partial<typeof marketingBroadcasts.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.channel !== undefined) values.channel = ensureChannel(input.channel);
  if (input.segmentKey !== undefined) values.segmentKey = input.segmentKey;
  if (input.templateBody !== undefined) values.templateBody = input.templateBody.slice(0, 2000);
  if (input.status !== undefined) values.status = ensureBroadcastStatus(input.status);
  if (input.scheduledAt !== undefined) values.scheduledAt = parseDateInput(input.scheduledAt);
  if (input.sentAt !== undefined) values.sentAt = parseDateInput(input.sentAt);
  if (input.totalRecipients !== undefined)
    values.totalRecipients = Math.max(0, input.totalRecipients);
  if (input.sentCount !== undefined) values.sentCount = Math.max(0, input.sentCount);
  if (input.openedCount !== undefined) values.openedCount = Math.max(0, input.openedCount);
  if (input.clickedCount !== undefined) values.clickedCount = Math.max(0, input.clickedCount);
  if (input.notes !== undefined) values.notes = input.notes?.trim() || null;
  if (input.campaignId !== undefined) values.campaignId = input.campaignId || null;

  const [row] = await db
    .update(marketingBroadcasts)
    .set(values)
    .where(eq(marketingBroadcasts.id, id))
    .returning();
  return row ? serializeBroadcast(row) : null;
}

export async function markMarketingBroadcastSent(id: string, sentCount: number) {
  return updateMarketingBroadcast(id, {
    status: "sent",
    sentAt: new Date().toISOString(),
    sentCount,
  });
}

export async function getMarketingOverview() {
  const db = getDb();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    statusRows,
    channelRows,
    spendRow,
    budgetRow,
    actualRow,
    targetRow,
    broadcastStatusRows,
    sentRow,
    voucherRedeemRow,
    voucherRedeemAllRow,
    campaignLogsRow,
    upcomingBroadcasts,
    activeCampaignsList,
    customerTotalRow,
    repeatRow,
  ] = await Promise.all([
    db
      .select({ status: marketingCampaigns.status, count: count(marketingCampaigns.id) })
      .from(marketingCampaigns)
      .groupBy(marketingCampaigns.status),
    db
      .select({ channel: marketingCampaigns.channel, count: count(marketingCampaigns.id) })
      .from(marketingCampaigns)
      .groupBy(marketingCampaigns.channel),
    db
      .select({ spend: sql<number>`coalesce(sum(${marketingCampaigns.spend}), 0)`.mapWith(Number) })
      .from(marketingCampaigns),
    db
      .select({ budget: sql<number>`coalesce(sum(${marketingCampaigns.budget}), 0)`.mapWith(Number) })
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.status, "active"))),
    db
      .select({
        actualRevenue: sql<number>`coalesce(sum(${marketingCampaigns.actualRevenue}), 0)`.mapWith(Number),
        actualOrders: sql<number>`coalesce(sum(${marketingCampaigns.actualOrders}), 0)`.mapWith(Number),
      })
      .from(marketingCampaigns),
    db
      .select({
        targetRevenue: sql<number>`coalesce(sum(${marketingCampaigns.targetRevenue}), 0)`.mapWith(Number),
        targetOrders: sql<number>`coalesce(sum(${marketingCampaigns.targetOrders}), 0)`.mapWith(Number),
      })
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.status, "active"))),
    db
      .select({ status: marketingBroadcasts.status, count: count(marketingBroadcasts.id) })
      .from(marketingBroadcasts)
      .groupBy(marketingBroadcasts.status),
    db
      .select({
        sent: sql<number>`coalesce(sum(${marketingBroadcasts.sentCount}), 0)`.mapWith(Number),
        opened: sql<number>`coalesce(sum(${marketingBroadcasts.openedCount}), 0)`.mapWith(Number),
      })
      .from(marketingBroadcasts)
      .where(gte(marketingBroadcasts.sentAt, since30)),
    db
      .select({
        count: count(voucherRedemptions.id),
        discount: sql<number>`coalesce(sum(${voucherRedemptions.discount}), 0)`.mapWith(Number),
      })
      .from(voucherRedemptions)
      .where(gte(voucherRedemptions.createdAt, since30)),
    db
      .select({
        count: count(voucherRedemptions.id),
        discount: sql<number>`coalesce(sum(${voucherRedemptions.discount}), 0)`.mapWith(Number),
      })
      .from(voucherRedemptions),
    db
      .select({ count: count(crmCampaignLogs.id) })
      .from(crmCampaignLogs)
      .where(gte(crmCampaignLogs.createdAt, since30)),
    db
      .select({
        broadcast: marketingBroadcasts,
        campaignName: marketingCampaigns.name,
      })
      .from(marketingBroadcasts)
      .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingBroadcasts.campaignId))
      .where(
        and(
          eq(marketingBroadcasts.status, "scheduled"),
          gte(marketingBroadcasts.scheduledAt, now),
        ),
      )
      .orderBy(asc(marketingBroadcasts.scheduledAt))
      .limit(5),
    db
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.status, "active"))
      .orderBy(desc(marketingCampaigns.startsAt))
      .limit(5),
    db.select({ count: count(customers.id) }).from(customers),
    db
      .select({ count: count(customers.id) })
      .from(customers)
      .where(gte(customers.visits, 2)),
  ]);

  const statusMap = new Map<string, number>();
  for (const row of statusRows) {
    statusMap.set(row.status, Number(row.count));
  }
  const channelMap = new Map<string, number>();
  for (const row of channelRows) {
    channelMap.set(row.channel, Number(row.count));
  }
  const broadcastStatusMap = new Map<string, number>();
  for (const row of broadcastStatusRows) {
    broadcastStatusMap.set(row.status, Number(row.count));
  }

  const totalSpend = Number(spendRow[0]?.spend ?? 0);
  const activeBudget = Number(budgetRow[0]?.budget ?? 0);
  const actualRevenue = Number(actualRow[0]?.actualRevenue ?? 0);
  const actualOrders = Number(actualRow[0]?.actualOrders ?? 0);
  const targetRevenue = Number(targetRow[0]?.targetRevenue ?? 0);
  const targetOrders = Number(targetRow[0]?.targetOrders ?? 0);

  const totalCampaigns = Array.from(statusMap.values()).reduce((sum, v) => sum + v, 0);
  const totalBroadcasts = Array.from(broadcastStatusMap.values()).reduce((sum, v) => sum + v, 0);

  const totalCustomers = Number(customerTotalRow[0]?.count ?? 0);
  const repeatCustomers = Number(repeatRow[0]?.count ?? 0);
  const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

  return {
    generatedAt: now.toISOString(),
    windowSince: since30.toISOString(),
    campaigns: {
      total: totalCampaigns,
      active: statusMap.get("active") ?? 0,
      scheduled: statusMap.get("scheduled") ?? 0,
      draft: statusMap.get("draft") ?? 0,
      completed: statusMap.get("completed") ?? 0,
      paused: statusMap.get("paused") ?? 0,
      archived: statusMap.get("archived") ?? 0,
      byChannel: Object.fromEntries(channelMap),
    },
    broadcasts: {
      total: totalBroadcasts,
      scheduled: broadcastStatusMap.get("scheduled") ?? 0,
      sent: broadcastStatusMap.get("sent") ?? 0,
      sending: broadcastStatusMap.get("sending") ?? 0,
      cancelled: broadcastStatusMap.get("cancelled") ?? 0,
      sentLast30d: Number(sentRow[0]?.sent ?? 0),
      openedLast30d: Number(sentRow[0]?.opened ?? 0),
    },
    spend: {
      total: totalSpend,
      activeBudget,
      utilizationPct: activeBudget > 0 ? Math.round((totalSpend / activeBudget) * 100) : 0,
    },
    performance: {
      actualRevenue,
      actualOrders,
      targetRevenue,
      targetOrders,
      revenueAchievedPct:
        targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : 0,
      orderAchievedPct: targetOrders > 0 ? Math.round((actualOrders / targetOrders) * 100) : 0,
      roi:
        totalSpend > 0
          ? Math.round(((actualRevenue - totalSpend) / totalSpend) * 100)
          : 0,
    },
    promos: {
      redeemedLast30d: Number(voucherRedeemRow[0]?.count ?? 0),
      discountLast30d: Number(voucherRedeemRow[0]?.discount ?? 0),
      redeemedAllTime: Number(voucherRedeemAllRow[0]?.count ?? 0),
      discountAllTime: Number(voucherRedeemAllRow[0]?.discount ?? 0),
    },
    engagement: {
      campaignLogsLast30d: Number(campaignLogsRow[0]?.count ?? 0),
      repeatRatePct: repeatRate,
      totalCustomers,
    },
    upcomingBroadcasts: upcomingBroadcasts.map((row) =>
      serializeBroadcast(row.broadcast, { campaignName: row.campaignName }),
    ),
    activeCampaigns: activeCampaignsList.map((row) => serializeCampaign(row)),
  };
}

export async function listMarketingPromos(params?: { status?: string; limit?: number }) {
  const db = getDb();
  const limit = Math.max(1, Math.min(200, params?.limit ?? 100));
  const rows = await db
    .select()
    .from(vouchers)
    .where(params?.status && params.status !== "all" ? eq(vouchers.status, params.status) : undefined)
    .orderBy(desc(vouchers.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return [] as Array<ReturnType<typeof serializePromo>>;
  }

  const aggregates = await db
    .select({
      voucherId: voucherRedemptions.voucherId,
      count: count(voucherRedemptions.id),
      discount: sql<number>`coalesce(sum(${voucherRedemptions.discount}), 0)`.mapWith(Number),
    })
    .from(voucherRedemptions)
    .groupBy(voucherRedemptions.voucherId);

  const aggMap = new Map<string, { count: number; discount: number }>();
  for (const row of aggregates) {
    if (!row.voucherId) continue;
    aggMap.set(row.voucherId, {
      count: Number(row.count ?? 0),
      discount: Number(row.discount ?? 0),
    });
  }

  return rows.map((row) => serializePromo(row, aggMap.get(row.id)));
}

function serializePromo(
  row: typeof vouchers.$inferSelect,
  agg?: { count: number; discount: number },
) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type as "fixed" | "percent",
    value: row.value,
    minSpend: row.minSpend,
    maxDiscount: row.maxDiscount,
    audience: row.audience,
    status: row.status as "active" | "draft" | "paused" | "expired",
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    redemptionCount: agg?.count ?? 0,
    discountTotal: agg?.discount ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export type CreateMarketingPromoInput = {
  code: string;
  title: string;
  type: "fixed" | "percent";
  value: number;
  minSpend?: number;
  maxDiscount?: number | null;
  audience?: string;
  status?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
};

export async function createMarketingPromo(input: CreateMarketingPromoInput) {
  const db = getDb();
  const [row] = await db
    .insert(vouchers)
    .values({
      code: input.code.trim().toUpperCase().replace(/\s+/g, ""),
      title: input.title.trim(),
      type: input.type,
      value: Math.max(0, input.value),
      minSpend: Math.max(0, input.minSpend ?? 0),
      maxDiscount: input.maxDiscount ?? null,
      audience: input.audience ?? "all",
      status: input.status ?? "active",
      startsAt: parseDateInput(input.startsAt) ?? undefined,
      endsAt: parseDateInput(input.endsAt) ?? undefined,
      usageLimit: input.usageLimit ?? null,
    })
    .returning();

  return serializePromo(row);
}

export async function updateMarketingPromoStatus(id: string, status: string) {
  const db = getDb();
  const [row] = await db
    .update(vouchers)
    .set({ status, updatedAt: new Date() })
    .where(eq(vouchers.id, id))
    .returning();
  return row ? serializePromo(row) : null;
}

export async function getMarketingCalendar(params?: {
  monthStart?: string;
  monthEnd?: string;
}) {
  const db = getDb();
  const now = new Date();
  const start = params?.monthStart
    ? parseDateInput(params.monthStart)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = params?.monthEnd
    ? parseDateInput(params.monthEnd)
    : new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const safeStart = start ?? new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const safeEnd = end ?? new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const [campaignRows, broadcastRows, promoRows] = await Promise.all([
    db
      .select()
      .from(marketingCampaigns)
      .where(
        and(
          gte(marketingCampaigns.startsAt, safeStart),
        ),
      )
      .orderBy(asc(marketingCampaigns.startsAt)),
    db
      .select({
        broadcast: marketingBroadcasts,
        campaignName: marketingCampaigns.name,
        campaignCode: marketingCampaigns.code,
      })
      .from(marketingBroadcasts)
      .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingBroadcasts.campaignId))
      .where(and(gte(marketingBroadcasts.scheduledAt, safeStart)))
      .orderBy(asc(marketingBroadcasts.scheduledAt)),
    db
      .select()
      .from(vouchers)
      .where(and(gte(vouchers.startsAt, safeStart)))
      .orderBy(asc(vouchers.startsAt)),
  ]);

  const campaignEntries = campaignRows
    .filter((row) => row.startsAt && row.startsAt <= safeEnd)
    .map((row) => ({
      id: `campaign-${row.id}`,
      kind: "campaign" as const,
      title: row.name,
      code: row.code,
      status: row.status,
      channel: row.channel,
      segmentKey: row.segmentKey,
      date: row.startsAt!.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
    }));

  const broadcastEntries = broadcastRows
    .filter((row) => row.broadcast.scheduledAt && row.broadcast.scheduledAt <= safeEnd)
    .map((row) => ({
      id: `broadcast-${row.broadcast.id}`,
      kind: "broadcast" as const,
      title: row.broadcast.name,
      code: row.campaignCode ?? null,
      campaignName: row.campaignName ?? null,
      status: row.broadcast.status,
      channel: row.broadcast.channel,
      segmentKey: row.broadcast.segmentKey,
      date: row.broadcast.scheduledAt!.toISOString(),
      endsAt: null,
    }));

  const promoEntries = promoRows
    .filter((row) => row.startsAt && row.startsAt <= safeEnd)
    .map((row) => ({
      id: `promo-${row.id}`,
      kind: "promo" as const,
      title: row.title,
      code: row.code,
      status: row.status,
      channel: row.audience,
      segmentKey: null,
      date: row.startsAt!.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
    }));

  const all = [...campaignEntries, ...broadcastEntries, ...promoEntries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return {
    rangeStart: safeStart.toISOString(),
    rangeEnd: safeEnd.toISOString(),
    entries: all,
  };
}
