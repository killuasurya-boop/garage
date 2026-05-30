import { ok } from "@/lib/api-response";
import type { Role } from "@/lib/garage-data";
import {
  listStaffTasks,
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
