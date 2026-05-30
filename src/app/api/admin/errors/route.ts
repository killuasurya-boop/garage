import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { errorEvents } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { recordError } from "@/lib/garage-error-tracking";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const resolveSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
  notes: z.string().optional(),
});

// GET — list errors (admin view)
export async function GET(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const url = new URL(request.url);
  const includeResolved = url.searchParams.get("includeResolved") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const db = getDb();
  const rows = await db
    .select()
    .from(errorEvents)
    .where(includeResolved ? undefined : eq(errorEvents.resolved, false))
    .orderBy(desc(errorEvents.occurredAt))
    .limit(limit);

  // Group by fingerprint untuk dedup
  const grouped = new Map<
    string,
    { count: number; latest: typeof rows[number] }
  >();
  for (const row of rows) {
    const fp = row.fingerprint ?? row.id;
    const existing = grouped.get(fp);
    if (!existing || row.occurredAt > existing.latest.occurredAt) {
      grouped.set(fp, { count: (existing?.count ?? 0) + 1, latest: row });
    } else {
      grouped.set(fp, { count: existing.count + 1, latest: existing.latest });
    }
  }

  const events = Array.from(grouped.values())
    .sort((a, b) => b.latest.occurredAt.getTime() - a.latest.occurredAt.getTime())
    .map(({ count, latest }) => ({
      id: latest.id,
      source: latest.source,
      route: latest.route,
      message: latest.message,
      statusCode: latest.statusCode,
      occurredAt: latest.occurredAt.toISOString(),
      resolved: latest.resolved,
      fingerprint: latest.fingerprint,
      occurrences: count,
    }));

  // Stats 24h
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      last24h: sql<number>`count(*) filter (where ${errorEvents.occurredAt} > now() - interval '24 hours')::int`,
      unresolved: sql<number>`count(*) filter (where ${errorEvents.resolved} = false)::int`,
    })
    .from(errorEvents);

  return ok({
    events,
    stats: {
      total: Number(stats?.total ?? 0),
      last24h: Number(stats?.last24h ?? 0),
      unresolved: Number(stats?.unresolved ?? 0),
    },
  });
}

// POST — client-side error reporter
export async function POST(request: Request) {
  // No auth required — kalau user gak login, error tetap ditangkap.
  const parsed = await readJson(request, clientErrorSchema);
  if (parsed.error) return parsed.error;

  await recordError(new Error(parsed.data.message), {
    source: "client",
    route: parsed.data.url,
    metadata: {
      stack: parsed.data.stack,
      userAgent: request.headers.get("user-agent"),
      ...parsed.data.metadata,
    },
  });

  return ok({ logged: true });
}

// PATCH — mark resolved
export async function PATCH(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  const parsed = await readJson(request, resolveSchema);
  if (parsed.error) return parsed.error;

  await getDb()
    .update(errorEvents)
    .set({
      resolved: parsed.data.resolved,
      resolvedAt: parsed.data.resolved ? new Date() : null,
      resolvedBy: parsed.data.resolved ? session.data.user.id : null,
    })
    .where(eq(errorEvents.id, parsed.data.id));

  return ok({ updated: true });
}
