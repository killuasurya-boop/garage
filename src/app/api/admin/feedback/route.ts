import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { feedbackEntries } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  category: z.enum(["bug", "suggestion", "praise", "question"]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  title: z.string().min(3).max(200),
  detail: z.string().min(10).max(5000),
  currentUrl: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "triaged", "in_progress", "resolved", "wontfix"]),
  notes: z.string().optional(),
});

// POST — submit feedback (semua role yang login boleh)
export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;

  const [inserted] = await getDb()
    .insert(feedbackEntries)
    .values({
      userId: session.data.user.id,
      userRole: session.data.profile.role,
      outletId: session.data.profile.outlet.id,
      category: parsed.data.category,
      priority: parsed.data.priority,
      title: parsed.data.title,
      detail: parsed.data.detail,
      currentUrl: parsed.data.currentUrl,
      userAgent: request.headers.get("user-agent"),
    })
    .returning({ id: feedbackEntries.id });

  return ok({ id: inserted.id, submitted: true }, { status: 201 });
}

// GET — list feedback (admin view)
export async function GET(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const db = getDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (status && status !== "all") conditions.push(eq(feedbackEntries.status, status));
  if (category && category !== "all") conditions.push(eq(feedbackEntries.category, category));

  const rows = await db
    .select()
    .from(feedbackEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(feedbackEntries.createdAt))
    .limit(limit);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${feedbackEntries.status} = 'open')::int`,
      critical: sql<number>`count(*) filter (where ${feedbackEntries.priority} = 'critical' and ${feedbackEntries.status} != 'resolved')::int`,
      bugs: sql<number>`count(*) filter (where ${feedbackEntries.category} = 'bug')::int`,
    })
    .from(feedbackEntries);

  return ok({
    entries: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      triagedAt: r.triagedAt?.toISOString() ?? null,
    })),
    stats: {
      total: Number(stats?.total ?? 0),
      open: Number(stats?.open ?? 0),
      critical: Number(stats?.critical ?? 0),
      bugs: Number(stats?.bugs ?? 0),
    },
  });
}

// PATCH — triage/update status
export async function PATCH(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  const parsed = await readJson(request, updateSchema);
  if (parsed.error) return parsed.error;

  await getDb()
    .update(feedbackEntries)
    .set({
      status: parsed.data.status,
      notes: parsed.data.notes,
      triagedBy: session.data.user.id,
      triagedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(feedbackEntries.id, parsed.data.id));

  return ok({ updated: true });
}
