import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { outlets } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import {
  ACTIVE_OUTLET_COOKIE,
  canSwitchOutlet,
  requireGarageSession,
} from "@/lib/server-auth";

export const runtime = "nodejs";

const switchSchema = z.object({
  outletId: z.string().uuid("Outlet ID tidak valid"),
});

export async function POST(request: Request) {
  const session = await requireGarageSession();
  if (session.response) {
    return session.response;
  }

  if (!canSwitchOutlet(session.data.profile.role)) {
    return fail(
      403,
      "OUTLET_SWITCH_FORBIDDEN",
      "Role kamu tidak boleh switch outlet. Hubungi Manager / Owner.",
    );
  }

  const body = await readJson(request, switchSchema);
  if (body.error) {
    return body.error;
  }

  // Pastikan outlet target ada & active
  const db = getDb();
  const [target] = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
      timezone: outlets.timezone,
      status: outlets.status,
    })
    .from(outlets)
    .where(eq(outlets.id, body.data.outletId))
    .limit(1);

  if (!target) {
    return fail(404, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan.");
  }
  if (target.status !== "active") {
    return fail(400, "OUTLET_INACTIVE", "Outlet tidak aktif.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_OUTLET_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 30 hari — short enough untuk security, panjang untuk UX
    maxAge: 60 * 60 * 24 * 30,
  });

  return ok({
    activeOutlet: {
      id: target.id,
      code: target.code,
      name: target.name,
      timezone: target.timezone,
    },
  });
}

// Reset ke default outlet dari staff profile
export async function DELETE() {
  const session = await requireGarageSession();
  if (session.response) {
    return session.response;
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_OUTLET_COOKIE);

  return ok({ resetTo: "default" });
}
