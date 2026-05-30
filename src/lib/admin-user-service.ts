import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  account,
  auditLogs,
  outlets,
  session as sessionTable,
  staffProfiles,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/garage-data";
import { permissionsForRole } from "@/lib/role-access";

export type AdminAuditContext = {
  actorUserId: string;
  actorName: string;
  deviceLabel?: string;
};

async function writeAdminAudit(
  context: AdminAuditContext | undefined,
  action: string,
  object: string,
  metadata?: Record<string, unknown>,
) {
  if (!context) return;
  try {
    await getDb().insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: context.actorName,
      action,
      object,
      device: context.deviceLabel ?? "control-panel",
      status: "ok",
      metadata: { actorUserId: context.actorUserId, ...(metadata ?? {}) },
    });
  } catch {
    // audit log gak boleh fail-block admin action
  }
}

export type AdminUserStatus = "active" | "suspended";

export type AdminUserRow = {
  userId: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
  profileId: string;
  role: Role;
  shiftLabel: string;
  deviceLabel: string;
  status: AdminUserStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  lastLoginAt: string | null;
  outletId: string;
  outletCode: string;
  outletName: string;
  activeSessions: number;
  permissionCount: number;
};

type ListFilters = {
  query?: string;
  role?: Role;
  status?: AdminUserStatus;
  outletId?: string;
  limit?: number;
  offset?: number;
};

export async function listAdminUsers(filters: ListFilters = {}): Promise<{
  rows: AdminUserRow[];
  total: number;
}> {
  const db = getDb();
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters.query) {
    const like = `%${filters.query}%`;
    conditions.push(
      or(ilike(user.email, like), ilike(user.name, like))! as ReturnType<typeof eq>,
    );
  }
  if (filters.role) conditions.push(eq(staffProfiles.role, filters.role));
  if (filters.status) conditions.push(eq(staffProfiles.status, filters.status));
  if (filters.outletId) conditions.push(eq(staffProfiles.outletId, filters.outletId));

  const whereExpr = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      profileId: staffProfiles.id,
      role: staffProfiles.role,
      shiftLabel: staffProfiles.shiftLabel,
      deviceLabel: staffProfiles.deviceLabel,
      status: staffProfiles.status,
      suspendedAt: staffProfiles.suspendedAt,
      suspendedReason: staffProfiles.suspendedReason,
      lastLoginAt: staffProfiles.lastLoginAt,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .innerJoin(outlets, eq(staffProfiles.outletId, outlets.id))
    .where(whereExpr)
    .orderBy(asc(user.name))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(whereExpr);
  const total = Number(totalRow[0]?.c ?? 0);

  const userIds = rows.map((row) => row.userId);
  const sessionCounts = new Map<string, number>();
  if (userIds.length) {
    const sessionRows = await db
      .select({
        userId: sessionTable.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionTable)
      .where(inArray(sessionTable.userId, userIds))
      .groupBy(sessionTable.userId);
    for (const sessionRow of sessionRows) {
      sessionCounts.set(sessionRow.userId, Number(sessionRow.count));
    }
  }

  const enriched: AdminUserRow[] = rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    profileId: row.profileId,
    role: row.role as Role,
    shiftLabel: row.shiftLabel,
    deviceLabel: row.deviceLabel,
    status: (row.status as AdminUserStatus) ?? "active",
    suspendedAt: row.suspendedAt ? row.suspendedAt.toISOString() : null,
    suspendedReason: row.suspendedReason,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    outletId: row.outletId,
    outletCode: row.outletCode,
    outletName: row.outletName,
    activeSessions: sessionCounts.get(row.userId) ?? 0,
    permissionCount: permissionsForRole(row.role as Role).length,
  }));

  return { rows: enriched, total };
}

export async function createAdminUser(
  input: {
    email: string;
    name: string;
    password: string;
    role: Role;
    outletId: string;
    shiftLabel?: string;
    deviceLabel?: string;
  },
  audit?: AdminAuditContext,
): Promise<{ userId: string } | { error: string }> {
  const db = getDb();
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1);
  if (existing.length) {
    return { error: "Email sudah dipakai." };
  }

  const [outletRow] = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(eq(outlets.id, input.outletId))
    .limit(1);
  if (!outletRow) {
    return { error: "Outlet tidak ditemukan." };
  }

  const result = (await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
  })) as { user?: { id: string } };

  const newUserId = result.user?.id;
  if (!newUserId) {
    const [created] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email))
      .limit(1);
    if (!created) {
      return { error: "Gagal membuat user di auth provider." };
    }
    await db.insert(staffProfiles).values({
      userId: created.id,
      outletId: input.outletId,
      role: input.role,
      shiftLabel: input.shiftLabel ?? "Shift aktif",
      deviceLabel: input.deviceLabel ?? "POS-01",
    });
    await writeAdminAudit(audit, "user.create", input.email, {
      role: input.role,
      outletId: input.outletId,
    });
    return { userId: created.id };
  }

  await db.insert(staffProfiles).values({
    userId: newUserId,
    outletId: input.outletId,
    role: input.role,
    shiftLabel: input.shiftLabel ?? "Shift aktif",
    deviceLabel: input.deviceLabel ?? "POS-01",
  });
  await writeAdminAudit(audit, "user.create", input.email, {
    role: input.role,
    outletId: input.outletId,
  });
  return { userId: newUserId };
}

export async function updateAdminUser(
  userId: string,
  patch: {
    name?: string;
    role?: Role;
    outletId?: string;
    shiftLabel?: string;
    deviceLabel?: string;
    status?: AdminUserStatus;
    suspendedReason?: string | null;
  },
  audit?: AdminAuditContext,
): Promise<{ ok: true } | { error: string }> {
  const db = getDb();

  if (patch.name !== undefined) {
    await db
      .update(user)
      .set({ name: patch.name, updatedAt: new Date() })
      .where(eq(user.id, userId));
  }

  const profileUpdate: Record<string, unknown> = {};
  if (patch.role !== undefined) profileUpdate.role = patch.role;
  if (patch.outletId !== undefined) profileUpdate.outletId = patch.outletId;
  if (patch.shiftLabel !== undefined) profileUpdate.shiftLabel = patch.shiftLabel;
  if (patch.deviceLabel !== undefined) profileUpdate.deviceLabel = patch.deviceLabel;
  if (patch.status !== undefined) {
    profileUpdate.status = patch.status;
    profileUpdate.suspendedAt = patch.status === "suspended" ? new Date() : null;
    if (patch.status === "active") profileUpdate.suspendedReason = null;
  }
  if (patch.suspendedReason !== undefined) {
    profileUpdate.suspendedReason = patch.suspendedReason;
  }

  if (Object.keys(profileUpdate).length) {
    profileUpdate.updatedAt = new Date();
    await db
      .update(staffProfiles)
      .set(profileUpdate)
      .where(eq(staffProfiles.userId, userId));
  }

  if (patch.status === "suspended") {
    await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
  }

  const action =
    patch.status === "suspended"
      ? "user.suspend"
      : patch.status === "active"
        ? "user.activate"
        : "user.update";
  await writeAdminAudit(audit, action, userId, patch as Record<string, unknown>);

  return { ok: true };
}

export async function deleteAdminUser(
  userId: string,
  audit?: AdminAuditContext,
): Promise<void> {
  const db = getDb();
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
  // cascade: staffProfiles + account dihapus via FK onDelete cascade dari user
  await db.delete(user).where(eq(user.id, userId));
  await writeAdminAudit(audit, "user.delete", userId);
}

export async function listUserSessions(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: sessionTable.id,
      ipAddress: sessionTable.ipAddress,
      userAgent: sessionTable.userAgent,
      expiresAt: sessionTable.expiresAt,
      createdAt: sessionTable.createdAt,
    })
    .from(sessionTable)
    .where(eq(sessionTable.userId, userId))
    .orderBy(desc(sessionTable.createdAt))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function forceLogoutUser(
  userId: string,
  sessionId?: string,
  audit?: AdminAuditContext,
) {
  const db = getDb();
  if (sessionId) {
    await db
      .delete(sessionTable)
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.id, sessionId)));
  } else {
    await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
  }
  await writeAdminAudit(audit, "user.force_logout", userId, { sessionId });
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  audit?: AdminAuditContext,
): Promise<{ ok: true } | { error: string }> {
  const db = getDb();
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  if (!credential) {
    return { error: "Akun credential tidak ditemukan untuk user ini." };
  }

  // Better Auth tidak expose admin-reset langsung — pakai context internal.
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);
  await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(account.id, credential.id));

  // Invalidate semua session — user harus login ulang dengan password baru.
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));

  await writeAdminAudit(audit, "user.reset_password", userId);

  return { ok: true };
}

export async function bulkAction(
  input: {
    userIds: string[];
    action: "suspend" | "activate" | "delete" | "force_logout";
    reason?: string;
  },
  audit?: AdminAuditContext,
) {
  if (!input.userIds.length) return { affected: 0 };
  const db = getDb();

  if (input.action === "delete") {
    await db.delete(sessionTable).where(inArray(sessionTable.userId, input.userIds));
    await db.delete(user).where(inArray(user.id, input.userIds));
    await writeAdminAudit(audit, "user.bulk_delete", input.userIds.join(","), {
      count: input.userIds.length,
    });
    return { affected: input.userIds.length };
  }

  if (input.action === "force_logout") {
    await db.delete(sessionTable).where(inArray(sessionTable.userId, input.userIds));
    await writeAdminAudit(audit, "user.bulk_force_logout", input.userIds.join(","), {
      count: input.userIds.length,
    });
    return { affected: input.userIds.length };
  }

  const status: AdminUserStatus = input.action === "suspend" ? "suspended" : "active";
  await db
    .update(staffProfiles)
    .set({
      status,
      suspendedAt: status === "suspended" ? new Date() : null,
      suspendedReason: status === "suspended" ? input.reason ?? null : null,
      updatedAt: new Date(),
    })
    .where(inArray(staffProfiles.userId, input.userIds));

  if (status === "suspended") {
    await db.delete(sessionTable).where(inArray(sessionTable.userId, input.userIds));
  }

  await writeAdminAudit(audit, `user.bulk_${input.action}`, input.userIds.join(","), {
    count: input.userIds.length,
    reason: input.reason,
  });

  return { affected: input.userIds.length };
}
