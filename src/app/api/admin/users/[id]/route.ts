import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { deleteAdminUser, updateAdminUser, resetUserPassword } from "@/lib/admin-user-service";
import type { Role } from "@/lib/garage-data";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const ROLE_VALUES: [Role, ...Role[]] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Kasir",
  "Barista",
  "Koki",
  "Asisten Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
  "Supervisor Shift",
  "Delivery Admin",
];

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  outletId: z.string().uuid().optional(),
  shiftLabel: z.string().optional(),
  deviceLabel: z.string().optional(),
  division: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  status: z.enum(["active", "suspended"]).optional(),
  suspendedReason: z.string().nullable().optional(),
  passwordResetRequired: z.boolean().optional(),
  newPassword: z.string().min(8, "Password minimal 8 karakter").optional().nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;

  if (session.data.user.id === id && parsed.data.status === "suspended") {
    return fail(400, "CANNOT_SUSPEND_SELF", "Tidak bisa men-suspend diri sendiri.");
  }

  const actorConfig = {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    actorRole: session.data.profile.role,
    deviceLabel: session.data.profile.deviceLabel,
  };

  if (parsed.data.newPassword) {
    const resetResult = await resetUserPassword(id, parsed.data.newPassword, actorConfig);
    if ("error" in resetResult) {
      return fail(400, "RESET_PASSWORD_FAILED", resetResult.error);
    }
  }

  const patch = parsed.data.newPassword
    ? { ...parsed.data, passwordResetRequired: true }
    : parsed.data;
  const result = await updateAdminUser(id, patch, actorConfig);
  if ("error" in result) {
    return fail(400, "UPDATE_USER_FAILED", result.error);
  }
  return ok({ updated: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const { id } = await context.params;
  if (session.data.user.id === id) {
    return fail(400, "CANNOT_DELETE_SELF", "Tidak bisa menghapus akun sendiri.");
  }

  try {
    await deleteAdminUser(id, {
      actorUserId: session.data.user.id,
      actorName: session.data.user.name,
      actorRole: session.data.profile.role,
      deviceLabel: session.data.profile.deviceLabel,
    });
  } catch (error) {
    return fail(
      400,
      "DELETE_USER_FAILED",
      error instanceof Error ? error.message : "Gagal menghapus user.",
    );
  }
  return ok({ deleted: true });
}
