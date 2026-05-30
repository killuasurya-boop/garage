import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { getDb } from "@/db";
import { outlets, staffProfiles } from "@/db/schema";
import { fail } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/garage-data";
import { canUseApi, type Permission } from "@/lib/role-access";

export const ACTIVE_OUTLET_COOKIE = "garage_active_outlet";

// Role yang boleh switch outlet via OutletSwitcher.
// Staff role lain terkunci di outlet dari profile mereka.
const OUTLET_SWITCH_ALLOWED_ROLES: ReadonlyArray<Role> = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
];

export function canSwitchOutlet(role: Role): boolean {
  return OUTLET_SWITCH_ALLOWED_ROLES.includes(role);
}

export type GarageSession = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];
  profile: {
    id: string;
    role: Role;
    shiftLabel: string;
    deviceLabel: string;
    outlet: {
      id: string;
      code: string;
      name: string;
      timezone: string;
    };
  };
};

export async function requireGarageSession(allowedRoles?: Role[]) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return {
      data: null,
      response: fail(401, "UNAUTHENTICATED", "Please sign in to Garage OS."),
    };
  }

  const db = getDb();
  const [row] = await db
    .select({
      profileId: staffProfiles.id,
      role: staffProfiles.role,
      shiftLabel: staffProfiles.shiftLabel,
      deviceLabel: staffProfiles.deviceLabel,
      status: staffProfiles.status,
      lastLoginAt: staffProfiles.lastLoginAt,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
      outletTimezone: outlets.timezone,
    })
    .from(staffProfiles)
    .innerJoin(outlets, eq(staffProfiles.outletId, outlets.id))
    .where(eq(staffProfiles.userId, session.user.id))
    .limit(1);

  if (!row) {
    return {
      data: null,
      response: fail(403, "STAFF_PROFILE_MISSING", "No Garage staff profile found."),
    };
  }

  if (row.status === "suspended") {
    return {
      data: null,
      response: fail(403, "ACCOUNT_SUSPENDED", "Akun anda di-suspend oleh admin."),
    };
  }

  // Update lastLoginAt sekali per sesi: kalau session lebih baru dari last login,
  // berarti login baru → catat. Idempotent: hit kedua dst di sesi yang sama no-op.
  const sessionCreatedAt = new Date(session.session.createdAt);
  if (!row.lastLoginAt || sessionCreatedAt > row.lastLoginAt) {
    db
      .update(staffProfiles)
      .set({ lastLoginAt: sessionCreatedAt })
      .where(eq(staffProfiles.id, row.profileId))
      .catch(() => {
        // last-login update gak boleh blocking
      });
  }

  if (allowedRoles?.length && !allowedRoles.includes(row.role as Role)) {
    return {
      data: null,
      response: fail(403, "FORBIDDEN", "Your role cannot perform this action."),
    };
  }

  // Cek active outlet override dari cookie (hanya untuk role yg boleh switch).
  // Kalau cookie valid & outlet aktif, ganti outlet info di profile.
  let activeOutlet = {
    id: row.outletId,
    code: row.outletCode,
    name: row.outletName,
    timezone: row.outletTimezone,
  };

  if (canSwitchOutlet(row.role as Role)) {
    try {
      const cookieStore = await cookies();
      const overrideId = cookieStore.get(ACTIVE_OUTLET_COOKIE)?.value;
      if (overrideId && overrideId !== row.outletId) {
        const [override] = await db
          .select({
            id: outlets.id,
            code: outlets.code,
            name: outlets.name,
            timezone: outlets.timezone,
            status: outlets.status,
          })
          .from(outlets)
          .where(eq(outlets.id, overrideId))
          .limit(1);
        if (override && override.status === "active") {
          activeOutlet = {
            id: override.id,
            code: override.code,
            name: override.name,
            timezone: override.timezone,
          };
        }
      }
    } catch {
      // Cookie read gagal — fallback ke default outlet dari profile
    }
  }

  return {
    data: {
      session,
      user: session.user,
      profile: {
        id: row.profileId,
        role: row.role as Role,
        shiftLabel: row.shiftLabel,
        deviceLabel: row.deviceLabel,
        outlet: activeOutlet,
      },
    } satisfies GarageSession,
    response: null,
  };
}

export async function requirePermission(permission: Permission) {
  const session = await requireGarageSession();
  if (session.response) {
    return session;
  }

  if (!canUseApi(session.data.profile.role, permission)) {
    return {
      data: null,
      response: fail(403, "FORBIDDEN", "Your role cannot perform this action."),
    };
  }

  return session;
}

export async function requireAnyPermission(permissions: Permission[]) {
  const session = await requireGarageSession();
  if (session.response) {
    return session;
  }

  if (!permissions.some((permission) => canUseApi(session.data.profile.role, permission))) {
    return {
      data: null,
      response: fail(403, "FORBIDDEN", "Your role cannot perform this action."),
    };
  }

  return session;
}
