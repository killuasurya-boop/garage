import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  contentPublishingQueue,
  contentPublishingResults,
} from "@/db/schema";
import { fetchProviderAnalytics, publishToProvider } from "@/lib/garage-provider-adapters";
import type { MetaWebhookPublishEvent } from "@/lib/garage-provider-adapters";
import { getPublishingReadinessReport } from "@/lib/garage-integrations";
import { auditSafely } from "@/lib/garage-social-audit";

export const CONTENT_PUBLISHING_STATUSES = [
  "draft",
  "ai_ready",
  "needs_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
  "rejected",
  "revision",
] as const;

export type ContentPublishingStatus = (typeof CONTENT_PUBLISHING_STATUSES)[number];
export type PublishingPlatform =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "threads"
  | "youtube"
  | "google_business";

const ALLOWED_TRANSITIONS: Record<ContentPublishingStatus, ContentPublishingStatus[]> = {
  draft: ["ai_ready", "needs_approval", "rejected"],
  ai_ready: ["needs_approval", "revision", "rejected"],
  needs_approval: ["approved", "revision", "rejected"],
  approved: ["scheduled", "publishing", "revision", "rejected"],
  scheduled: ["publishing", "revision", "rejected"],
  publishing: ["published", "partial", "failed"],
  published: [],
  partial: ["publishing", "revision"],
  failed: ["publishing", "revision", "rejected"],
  rejected: ["revision"],
  revision: ["ai_ready", "needs_approval", "rejected"],
};

export function canTransitionContentStatus(
  current: ContentPublishingStatus,
  next: ContentPublishingStatus,
) {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function assertContentCanPublish(status: string) {
  if (!["approved", "scheduled", "failed", "partial"].includes(status)) {
    throw new Error("Konten hanya dapat dipublish setelah status APPROVED.");
  }
}

export function isSocialPublishingLiveEnabled() {
  return process.env.SOCIAL_PUBLISHING_LIVE_ENABLED?.trim().toLowerCase() === "true";
}

export function shouldSkipPublishedPlatform(status?: string | null) {
  return status === "published";
}

export async function assertPublishingProvidersReady(platforms: PublishingPlatform[]) {
  const report = await getPublishingReadinessReport(platforms);
  if (report.ready) return report;
  const blockingMessages = [...report.blockers, ...report.warnings]
    .slice(0, 6)
    .map((item) => `${item.label}: ${item.message}`);
  throw new Error(
    [
      "Provider publish belum siap.",
      blockingMessages.length ? blockingMessages.join("; ") : "Jalankan health check integrasi.",
    ].join(" "),
  );
}

export async function listContentPublishingQueue(params?: {
  status?: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = Math.max(1, Math.min(200, params?.limit ?? 100));
  return db
    .select()
    .from(contentPublishingQueue)
    .where(
      params?.status && params.status !== "all"
        ? eq(contentPublishingQueue.status, params.status)
        : undefined,
    )
    .orderBy(desc(contentPublishingQueue.createdAt))
    .limit(limit);
}

export async function createContentPublishingItem(input: {
  campaignId?: string | null;
  title: string;
  contentText?: string;
  caption?: string;
  hashtags?: string[];
  assetUrl?: string | null;
  assetUrls?: string[];
  thumbnailUrl?: string | null;
  platforms: PublishingPlatform[];
  scheduledAt?: string | null;
  createdBy: string;
}) {
  const [row] = await getDb()
    .insert(contentPublishingQueue)
    .values({
      campaignId: input.campaignId || null,
      title: input.title.trim(),
      contentText: input.contentText?.trim() || "",
      caption: input.caption?.trim() || "",
      hashtags: uniqueStrings(input.hashtags ?? []),
      assetUrl: input.assetUrl?.trim() || null,
      assetUrls: uniqueStrings(input.assetUrls ?? []),
      thumbnailUrl: input.thumbnailUrl?.trim() || null,
      platforms: uniqueStrings(input.platforms),
      status: "draft",
      scheduledAt: parseDate(input.scheduledAt),
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function updateContentPublishingStatus(input: {
  id: string;
  status: ContentPublishingStatus;
  userId: string;
  revisionNotes?: string | null;
  rejectionReason?: string | null;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(contentPublishingQueue)
    .where(eq(contentPublishingQueue.id, input.id))
    .limit(1);
  if (!existing) return null;

  const current = existing.status as ContentPublishingStatus;
  if (!canTransitionContentStatus(current, input.status)) {
    throw new Error(`Transisi status ${current} ke ${input.status} tidak diizinkan.`);
  }

  const [updated] = await db
    .update(contentPublishingQueue)
    .set({
      status: input.status,
      approvedAt: input.status === "approved" ? new Date() : existing.approvedAt,
      approvedBy: input.status === "approved" ? input.userId : existing.approvedBy,
      revisionNotes:
        input.status === "revision" ? input.revisionNotes?.trim() || null : existing.revisionNotes,
      rejectionReason:
        input.status === "rejected"
          ? input.rejectionReason?.trim() || "Ditolak oleh approver."
          : existing.rejectionReason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentPublishingQueue.id, input.id),
        eq(contentPublishingQueue.status, existing.status),
      ),
    )
    .returning();

  if (!updated) throw new Error("Status konten berubah saat diproses. Muat ulang data.");
  auditSafely({
    actor: input.userId,
    action: "content_publishing.status",
    object: input.id,
    status: "success",
    metadata: {
      from: current,
      to: input.status,
      revisionNotes: input.revisionNotes ?? null,
      rejectionReason: input.rejectionReason ?? null,
    },
  });
  return updated;
}

export async function publishApprovedContent(id: string, actor?: string | null) {
  const db = getDb();
  const [queue] = await db
    .select()
    .from(contentPublishingQueue)
    .where(eq(contentPublishingQueue.id, id))
    .limit(1);
  if (!queue) return null;
  try {
    assertContentCanPublish(queue.status);
  } catch (error) {
    auditSafely({
      actor,
      action: "content_publishing.publish",
      object: id,
      status: "blocked",
      metadata: { status: queue.status, error: error instanceof Error ? error.message : "Blocked" },
    });
    throw error;
  }
  if (!queue.assetUrl) throw new Error("Asset URL wajib tersedia sebelum publish.");
  const platforms = queue.platforms as PublishingPlatform[];
  try {
    await assertPublishingProvidersReady(platforms);
  } catch (error) {
    auditSafely({
      actor,
      action: "content_publishing.publish.preflight",
      object: id,
      status: "blocked",
      metadata: { error: error instanceof Error ? error.message : "Provider belum siap." },
    });
    throw error;
  }

  const [locked] = await db
    .update(contentPublishingQueue)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(contentPublishingQueue.id, id), eq(contentPublishingQueue.status, queue.status)))
    .returning();
  if (!locked) throw new Error("Konten sedang diproses oleh worker lain.");

  const results: Array<{
    platform: PublishingPlatform;
    status: "published" | "failed";
    publishedUrl?: string;
    error?: string;
  }> = [];

  for (const platform of platforms) {
    const [previous] = await db
      .select()
      .from(contentPublishingResults)
      .where(
        and(
          eq(contentPublishingResults.queueId, queue.id),
          eq(contentPublishingResults.platform, platform),
        ),
      )
      .limit(1);
    if (shouldSkipPublishedPlatform(previous?.status)) {
      results.push({
        platform,
        status: "published",
        publishedUrl: previous.publishedUrl ?? undefined,
      });
      continue;
    }
    try {
      const published = await publishToProvider(platform, {
        title: queue.title,
        assetUrl: queue.assetUrl,
        assetUrls: queue.assetUrls as string[],
        caption: buildCaption(queue.caption, queue.hashtags as string[]),
      });
      await upsertResult({
        queueId: queue.id,
        platform,
        status: "published",
        providerPostId: published.postId,
        publishedUrl: published.publishedUrl,
      });
      auditSafely({
        actor,
        action: "content_publishing.publish.platform",
        object: queue.id,
        status: "success",
        metadata: { platform, providerPostId: published.postId },
      });
      results.push({ platform, status: "published", publishedUrl: published.publishedUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish gagal.";
      await upsertResult({
        queueId: queue.id,
        platform,
        status: "failed",
        error: message,
      });
      auditSafely({
        actor,
        action: "content_publishing.publish.platform",
        object: queue.id,
        status: "failed",
        metadata: { platform, error: message },
      });
      results.push({ platform, status: "failed", error: message });
    }
  }

  const publishedCount = results.filter((result) => result.status === "published").length;
  const finalStatus =
    publishedCount === results.length
      ? "published"
      : publishedCount > 0
        ? "partial"
        : "failed";
  await db
    .update(contentPublishingQueue)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(contentPublishingQueue.id, queue.id));
  auditSafely({
    actor,
    action: "content_publishing.publish",
    object: queue.id,
    status: finalStatus === "published" ? "success" : "failed",
    metadata: { finalStatus, results },
  });

  return { queueId: queue.id, status: finalStatus, results };
}

async function upsertResult(input: {
  queueId: string;
  platform: PublishingPlatform;
  status: "published" | "failed";
  providerPostId?: string;
  publishedUrl?: string;
  error?: string;
}) {
  const [previous] = await getDb()
    .select({ attemptCount: contentPublishingResults.attemptCount })
    .from(contentPublishingResults)
    .where(
      and(
        eq(contentPublishingResults.queueId, input.queueId),
        eq(contentPublishingResults.platform, input.platform),
      ),
    )
    .limit(1);
  const values = {
    queueId: input.queueId,
    platform: input.platform,
    idempotencyKey: `${input.queueId}:${input.platform}`,
    status: input.status,
    providerPostId: input.providerPostId ?? null,
    publishedUrl: input.publishedUrl ?? null,
    error: input.error ?? null,
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    lastAttemptAt: new Date(),
    publishedAt: input.status === "published" ? new Date() : null,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(contentPublishingResults)
    .values(values)
    .onConflictDoUpdate({
      target: [contentPublishingResults.queueId, contentPublishingResults.platform],
      set: values,
    });
}

export async function processScheduledPublishing(limit = 20) {
  if (!isSocialPublishingLiveEnabled()) {
    return [];
  }
  const now = new Date();
  const due = await getDb()
    .select({ id: contentPublishingQueue.id })
    .from(contentPublishingQueue)
    .where(
      and(
        inArray(contentPublishingQueue.status, ["scheduled", "partial", "failed"]),
        isNotNull(contentPublishingQueue.scheduledAt),
        lte(contentPublishingQueue.scheduledAt, now),
      ),
    )
    .orderBy(contentPublishingQueue.scheduledAt, contentPublishingQueue.createdAt)
    .limit(Math.max(1, Math.min(limit, 100)));

  const results = [];
  for (const item of due) {
    try {
      results.push(await publishApprovedContent(item.id));
    } catch (error) {
      results.push({
        queueId: item.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Publish gagal.",
      });
    }
  }
  return results;
}

export async function listPublishedResultsForAnalytics(limit = 100) {
  return getDb()
    .select()
    .from(contentPublishingResults)
    .where(eq(contentPublishingResults.status, "published"))
    .orderBy(desc(contentPublishingResults.publishedAt))
    .limit(Math.max(1, Math.min(limit, 500)));
}

export async function syncSocialAnalytics(limit = 100) {
  const rows = await listPublishedResultsForAnalytics(limit);
  const synced = [];
  for (const row of rows) {
    if (!row.providerPostId) continue;
    try {
      const analytics = await fetchProviderAnalytics(row.platform, row.providerPostId);
      await getDb()
        .update(contentPublishingResults)
        .set({ analytics, updatedAt: new Date() })
        .where(eq(contentPublishingResults.id, row.id));
      synced.push({ id: row.id, platform: row.platform, status: "synced", analytics });
    } catch (error) {
      synced.push({
        id: row.id,
        platform: row.platform,
        status: "failed",
        error: error instanceof Error ? error.message : "Analytics gagal.",
      });
    }
  }
  return synced;
}

export async function recordMetaWebhookPublishEvents(events: MetaWebhookPublishEvent[]) {
  const updates = [];
  for (const event of events) {
    const [updated] = await getDb()
      .update(contentPublishingResults)
      .set({
        status: event.status,
        error: event.status === "failed" ? event.error || "Meta webhook melaporkan gagal." : null,
        updatedAt: new Date(),
      })
      .where(eq(contentPublishingResults.providerPostId, event.providerPostId))
      .returning({
        id: contentPublishingResults.id,
        queueId: contentPublishingResults.queueId,
        platform: contentPublishingResults.platform,
        status: contentPublishingResults.status,
      });
    updates.push({
      providerPostId: event.providerPostId,
      platform: event.platform,
      matched: Boolean(updated),
      status: event.status,
    });
    auditSafely({
      action: "content_publishing.webhook.meta",
      object: event.providerPostId,
      status: updated ? "success" : "recorded",
      metadata: { event, matchedResult: updated ?? null },
    });
  }
  return updates;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Tanggal schedule tidak valid.");
  return date;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildCaption(caption: string, hashtags: string[]) {
  const normalized = hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  return [caption.trim(), normalized.join(" ")].filter(Boolean).join("\n\n");
}
