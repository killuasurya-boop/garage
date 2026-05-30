import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api-response";
import type { Role } from "@/lib/garage-data";
import { createAuditLog } from "@/lib/garage-service";
import {
  listStaffTasks,
  createStaffTasks,
  type StaffTaskStatus,
} from "@/lib/garage-staff-tasks";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVATED_ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
];

const createSchema = z.object({
  targetRole: z.string(),
  title: z.string().min(2, "Judul tugas minimal 2 karakter"),
  detail: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueAt: z.string().optional().nullable(),
  assigneeUserId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;

  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role");
  const statusParam = url.searchParams.get("status");
  const mineOnly = url.searchParams.get("mine") === "1";

  const myRole = session.data.profile.role;
  const isElevated = ELEVATED_ROLES.includes(myRole);

  // Staff biasa cuma boleh lihat task buat role-nya. Elevated boleh filter
  // role bebas atau lihat semua bila ?role= kosong.
  const targetRole: Role | undefined = isElevated
    ? ((roleParam as Role | null) ?? undefined)
    : myRole;

  const status = statusParam
    ? (statusParam.split(",") as StaffTaskStatus[])
    : (["open", "acknowledged"] as StaffTaskStatus[]);

  const tasks = await listStaffTasks({
    role: targetRole,
    status,
    assigneeUserId: mineOnly ? session.data.user.id : undefined,
    limit: 80,
  });

  return ok({ tasks });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(ELEVATED_ROLES);
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  const dueAtDate = body.data.dueAt ? new Date(body.data.dueAt) : null;

  const tasks = await createStaffTasks([
    {
      targetRole: body.data.targetRole as Role,
      title: body.data.title,
      detail: body.data.detail || "",
      priority: body.data.priority || "medium",
      dueAt: dueAtDate,
      createdBy: session.data.user.id,
      assigneeUserId: body.data.assigneeUserId || null,
      source: "manual",
    },
  ]);

  const createdTask = tasks[0];

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "Staff task created",
    object: `staff_task:${createdTask.id}`,
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      taskTitle: createdTask.title,
      targetRole: createdTask.targetRole,
      priority: createdTask.priority,
    },
  }).catch(() => undefined);

  return ok({ task: createdTask });
}
