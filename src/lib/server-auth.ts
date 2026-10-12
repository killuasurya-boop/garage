import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { ensureDatabaseReady, getDb } from "@/db";
import { outlets, staffProfiles } from "@/db/schema";
import { fail } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/garage-data";
import { canHandleMoney, canUseApiAs, MANAGEMENT_ROLES, type Permission } from "@/lib/role-access";
import { ensureStaffProfileAccessColumns } from "@/lib/staff-profile-schema-compat";

export const ACTIVE_OUTLET_COOKIE = "garage_active_outlet";

export function canSwitchOutlet(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}

export type GarageSession = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];
  profile: {
    id: string;
    role: Role;
    shiftLabel: string;
    deviceLabel: string;
    passwordResetRequired: boolean;
    // Workstation Production Hub ("bar" | "dapur" | "all" | null). Lihat
    // canOperateStation di garage-production-rules.
    workstation?: string | null;
    // Jabatan (Barista, Koki, Asisten Koki, ...). Bersama workstation
    // menentukan kapabilitas akun role Kasir — lihat effectivePermissions.
    position?: string | null;
    outlet: {
      id: string;
      code: string;
      name: string;
      timezone: string;
    };
  };
};

export async function requireGarageSession(allowedRoles?: Role[]) {
  await ensureDatabaseReady();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return {
      data: null,
      response: fail(401, "UNAUTHENTICATED", "Silakan login ke Garage OS."),
    };
  }

  const db = getDb();
  await ensureStaffProfileAccessColumns(db);
  const [row] = await db
    .select({
      profileId: staffProfiles.id,
      role: staffProfiles.role,
      shiftLabel: staffProfiles.shiftLabel,
      deviceLabel: staffProfiles.deviceLabel,
      status: staffProfiles.status,
      lastLoginAt: staffProfiles.lastLoginAt,
      passwordResetRequired: staffProfiles.passwordResetRequired,
      workstation: staffProfiles.workstation,
      position: staffProfiles.position,
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
      response: fail(403, "STAFF_PROFILE_MISSING", "Profil staf Garage tidak ditemukan."),
    };
  }

  if (row.status === "suspended") {
    return {
      data: null,
      response: fail(403, "ACCOUNT_SUSPENDED", "Akun anda di-suspend oleh admin."),
    };
  }
  if (row.status === "inactive") {
    return {
      data: null,
      response: fail(403, "ACCOUNT_INACTIVE", "Akun anda sudah tidak aktif. Hubungi Owner/Manajer."),
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
      response: fail(403, "FORBIDDEN", "Role Anda tidak punya akses untuk aksi ini."),
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
        passwordResetRequired: row.passwordResetRequired,
        workstation: row.workstation ?? null,
        position: row.position ?? null,
        outlet: activeOutlet,
      },
    } satisfies GarageSession,
    response: null,
  };
}

/**
 * Akun dengan kewajiban ganti password (akun baru / direset Owner) tidak boleh
 * memakai API operasional sampai password diganti. Halaman diarahkan oleh
 * page-access; API berizin ditolak di sini (dulu hanya halaman yang dicek).
 */
function passwordResetBlocked(session: { data: GarageSession }) {
  if (!session.data.profile.passwordResetRequired) return null;
  return {
    data: null,
    response: fail(
      403,
      "PASSWORD_RESET_REQUIRED",
      "Ganti password akun Anda dulu (menu Akun → Ganti Password) sebelum memakai kasir.",
    ),
  };
}

export async function requirePermission(permission: Permission) {
  const session = await requireGarageSession();
  if (session.response) {
    return session;
  }
  const resetBlocked = passwordResetBlocked(session);
  if (resetBlocked) return resetBlocked;

  if (!canUseApiAs(session.data.profile, permission)) {
    return {
      data: null,
      response: fail(403, "FORBIDDEN", "Akun Anda tidak punya akses untuk aksi ini."),
    };
  }

  return session;
}

/**
 * Sesi untuk aksi uang (terima/tandai lunas, split bill, voucher, serah-terima
 * kas): hanya kasir (role Kasir tanpa workstation) + Owner/Manajer.
 */
export async function requireCashierSession() {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir"]);
  if (session.response) {
    return session;
  }
  const resetBlocked = passwordResetBlocked(session);
  if (resetBlocked) return resetBlocked;
  if (!canHandleMoney(session.data.profile)) {
    return {
      data: null,
      response: fail(403, "CASHIER_ONLY", "Hanya kasir yang boleh memegang uang/pembayaran."),
    };
  }
  return session;
}

export async function requireAnyPermission(permissions: Permission[]) {
  const session = await requireGarageSession();
  if (session.response) {
    return session;
  }
  const resetBlocked = passwordResetBlocked(session);
  if (resetBlocked) return resetBlocked;

  if (!permissions.some((permission) => canUseApiAs(session.data.profile, permission))) {
    return {
      data: null,
      response: fail(403, "FORBIDDEN", "Role Anda tidak punya akses untuk aksi ini."),
    };
  }

  return session;
}
