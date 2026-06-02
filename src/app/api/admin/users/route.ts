import { z } from "zod";

import { isDatabaseConfigured } from "@/db";
import { fail, ok, readJson } from "@/lib/api-response";
import { createAdminUser, listAdminUsers } from "@/lib/admin-user-service";
import type { Role } from "@/lib/garage-data";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const createSchema = z.object({
  email: z.string().email("Email tidak valid"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  password: z.string().min(8, "Password minimal 8 karakter"),
  role: z.enum(ROLE_VALUES),
  outletId: z.string().uuid("Outlet ID harus UUID"),
  shiftLabel: z.string().optional(),
  deviceLabel: z.string().optional(),
  division: z.string().optional(),
  position: z.string().optional(),
  requirePasswordChange: z.boolean().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const role = (url.searchParams.get("role") as Role | null) ?? undefined;
  const status = url.searchParams.get("status") as "active" | "suspended" | null;
  const outletId = url.searchParams.get("outletId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listAdminUsers({
    query,
    role,
    status: status ?? undefined,
    outletId,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  return ok(result);
}

export async function POST(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;

  const result = await createAdminUser(parsed.data, {
    actorUserId: session.data.user.id,
    actorName: session.data.user.name,
    actorRole: session.data.profile.role,
    deviceLabel: session.data.profile.deviceLabel,
  });
  if ("error" in result) {
    return fail(400, "CREATE_USER_FAILED", result.error);
  }

  return ok({ userId: result.userId }, { status: 201 });
}
