import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { staffProfiles, staffTasks, user } from "@/db/schema";
import type { Role } from "@/lib/garage-data";

export type StaffTaskPriority = "low" | "medium" | "high";
export type StaffTaskStatus = "open" | "acknowledged" | "done" | "cancelled";

export type StaffTaskRow = {
  id: string;
  targetRole: Role;
  assigneeUserId: string | null;
  title: string;
  detail: string;
  priority: StaffTaskPriority;
  status: StaffTaskStatus;
  source: "ceo_ai" | "manual";
  sourceRunId: string | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type StaffTaskRecord = typeof staffTasks.$inferSelect;

function serialize(row: StaffTaskRecord): StaffTaskRow {
  return {
    id: row.id,
    targetRole: row.targetRole as Role,
    assigneeUserId: row.assigneeUserId,
    title: row.title,
    detail: row.detail,
    priority: row.priority as StaffTaskPriority,
    status: row.status as StaffTaskStatus,
    source: row.source as "ceo_ai" | "manual",
    sourceRunId: row.sourceRunId,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
    acknowledgedBy: row.acknowledgedBy,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedBy: row.completedBy,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancellationReason: row.cancellationReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CreateStaffTaskInput = {
  targetRole: Role;
  title: string;
  detail?: string;
  priority?: StaffTaskPriority;
  source?: "ceo_ai" | "manual";
  sourceRunId?: string | null;
  dueAt?: Date | null;
  createdBy?: string | null;
  assigneeUserId?: string | null;
};

export async function createStaffTasks(inputs: CreateStaffTaskInput[]): Promise<StaffTaskRow[]> {
  if (!inputs.length) return [];

  const db = getDb();
  const rows = await db
    .insert(staffTasks)
    .values(
      inputs.map((input) => ({
        targetRole: input.targetRole,
        assigneeUserId: input.assigneeUserId ?? null,
        title: input.title.trim().slice(0, 200),
        detail: (input.detail ?? "").slice(0, 2000),
        priority: input.priority ?? "medium",
        status: "open",
        source: input.source ?? "manual",
        sourceRunId: input.sourceRunId ?? null,
        dueAt: input.dueAt ?? null,
        createdBy: input.createdBy ?? null,
      })),
    )
    .returning();

  return rows.map(serialize);
}

export type ListStaffTasksInput = {
  role?: Role;
  status?: StaffTaskStatus | StaffTaskStatus[];
  assigneeUserId?: string;
  limit?: number;
};

export async function listStaffTasks(input: ListStaffTasksInput = {}): Promise<StaffTaskRow[]> {
  const db = getDb();
  const conditions = [];

  if (input.role) conditions.push(eq(staffTasks.targetRole, input.role));
  if (input.assigneeUserId) conditions.push(eq(staffTasks.assigneeUserId, input.assigneeUserId));
  if (input.status) {
    if (Array.isArray(input.status)) {
      conditions.push(inArray(staffTasks.status, input.status));
    } else {
      conditions.push(eq(staffTasks.status, input.status));
    }
  }

  const rows = await db
    .select()
    .from(staffTasks)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(staffTasks.createdAt))
    .limit(input.limit ?? 50);

  return rows.map(serialize);
}

export type UpdateStaffTaskInput = {
  taskId: string;
  action: "acknowledge" | "complete" | "cancel";
  actorUserId: string;
  cancellationReason?: string;
};

export async function updateStaffTaskStatus(input: UpdateStaffTaskInput): Promise<StaffTaskRow | null> {
  const db = getDb();
  const now = new Date();

  const patch: Partial<typeof staffTasks.$inferInsert> = { updatedAt: now };

  if (input.action === "acknowledge") {
    patch.status = "acknowledged";
    patch.acknowledgedAt = now;
    patch.acknowledgedBy = input.actorUserId;
  } else if (input.action === "complete") {
    patch.status = "done";
    patch.completedAt = now;
    patch.completedBy = input.actorUserId;
  } else if (input.action === "cancel") {
    patch.status = "cancelled";
    patch.cancelledAt = now;
    patch.cancellationReason = input.cancellationReason ?? null;
  }

  const [row] = await db
    .update(staffTasks)
    .set(patch)
    .where(eq(staffTasks.id, input.taskId))
    .returning();

  return row ? serialize(row) : null;
}

// Cari user yang punya staff_profile dengan role tsb. Pakai outletId optional
// kalau perlu filter per-outlet (saat ini broadcast global, jadi return semua).
export async function listUsersByRole(role: Role): Promise<Array<{ userId: string; name: string }>> {
  const db = getDb();
  const rows = await db
    .select({ userId: staffProfiles.userId, name: user.name })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(eq(staffProfiles.role, role));
  return rows;
}
