import { desc, eq, gte, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, session as sessionTable, staffProfiles, user } from "@/db/schema";

export type SecurityOverview = {
  activeSessions: number;
  suspendedAccounts: number;
  totalStaff: number;
  recentLoginCount24h: number;
  recentAuditCount24h: number;
};

export type ActiveSessionRow = {
  sessionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
};

export type SecurityAuditRow = {
  id: string;
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
  createdAt: string;
};

export async function getSecurityOverview(): Promise<SecurityOverview> {
  const db = getDb();
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [sessionCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sessionTable)
    .where(gte(sessionTable.expiresAt, now));

  const [suspendedCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(staffProfiles)
    .where(eq(staffProfiles.status, "suspended"));

  const [totalStaff] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(staffProfiles);

  const [recentLogin] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(staffProfiles)
    .where(gte(staffProfiles.lastLoginAt, cutoff24h));

  const [recentAudit] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, cutoff24h));

  return {
    activeSessions: Number(sessionCount?.c ?? 0),
    suspendedAccounts: Number(suspendedCount?.c ?? 0),
    totalStaff: Number(totalStaff?.c ?? 0),
    recentLoginCount24h: Number(recentLogin?.c ?? 0),
    recentAuditCount24h: Number(recentAudit?.c ?? 0),
  };
}

export async function listActiveSessions(limit = 50): Promise<ActiveSessionRow[]> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessionTable.id,
      userId: sessionTable.userId,
      ipAddress: sessionTable.ipAddress,
      userAgent: sessionTable.userAgent,
      expiresAt: sessionTable.expiresAt,
      createdAt: sessionTable.createdAt,
      userEmail: user.email,
      userName: user.name,
      role: staffProfiles.role,
    })
    .from(sessionTable)
    .innerJoin(user, eq(sessionTable.userId, user.id))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .where(gte(sessionTable.expiresAt, now))
    .orderBy(desc(sessionTable.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    sessionId: row.sessionId,
    userId: row.userId,
    userEmail: row.userEmail,
    userName: row.userName,
    role: row.role ?? "—",
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listSecurityAuditLogs(
  filters: {
    query?: string;
    actionPrefix?: string;
    limit?: number;
  } = {},
): Promise<SecurityAuditRow[]> {
  const db = getDb();
  const limit = Math.min(filters.limit ?? 100, 500);

  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters.actionPrefix) {
    conditions.push(ilike(auditLogs.action, `${filters.actionPrefix}%`) as ReturnType<typeof eq>);
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(auditLogs.actor, like),
        ilike(auditLogs.action, like),
        ilike(auditLogs.object, like),
      )! as ReturnType<typeof eq>,
    );
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      time: auditLogs.time,
      actor: auditLogs.actor,
      action: auditLogs.action,
      object: auditLogs.object,
      device: auditLogs.device,
      status: auditLogs.status,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(conditions.length ? (conditions.length === 1 ? conditions[0] : (sql`${conditions[0]} AND ${conditions[1]}` as ReturnType<typeof eq>)) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    time: row.time,
    actor: row.actor,
    action: row.action,
    object: row.object,
    device: row.device,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function forceLogoutAll(exceptUserId?: string): Promise<{ revoked: number }> {
  const db = getDb();
  const deleted = await db
    .delete(sessionTable)
    .where(
      exceptUserId
        ? sql`${sessionTable.userId} <> ${exceptUserId}`
        : sql`true`,
    )
    .returning({ id: sessionTable.id });
  return { revoked: deleted.length };
}
