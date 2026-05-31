import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { employeeAttendances, staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { jakartaDayRange } from "@/lib/attendance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const db = await getDb();
    const { searchParams } = new URL(req.url);

    // Default: hari ini (WIB). Bisa override dengan ?scope=all untuk 100 terbaru.
    const scope = searchParams.get("scope");
    const { start, end } = jakartaDayRange();

    // Satu daftar kolom (termasuk photoUrl). where hanya dibatasi "hari ini"
    // kecuali scope=all — disusun kondisional agar kolom tak pernah drift.
    const logs = await db
      .select({
        id: employeeAttendances.id,
        action: employeeAttendances.action,
        timestamp: employeeAttendances.timestamp,
        status: employeeAttendances.status,
        latitude: employeeAttendances.latitude,
        longitude: employeeAttendances.longitude,
        distanceMeters: employeeAttendances.distanceMeters,
        photoUrl: employeeAttendances.photoUrl,
        role: staffProfiles.role,
        name: user.name,
      })
      .from(employeeAttendances)
      .leftJoin(staffProfiles, eq(employeeAttendances.staffId, staffProfiles.id))
      .leftJoin(user, eq(staffProfiles.userId, user.id))
      .where(
        scope === "all"
          ? undefined
          : and(
              gte(employeeAttendances.timestamp, start),
              lt(employeeAttendances.timestamp, end),
            ),
      )
      .orderBy(desc(employeeAttendances.timestamp))
      .limit(200);

    const enriched = logs.map((log) => ({
      ...log,
      name: log.name ?? "Staf tidak dikenal",
      role: log.role ?? "—",
    }));

    return NextResponse.json({ logs: enriched });
  } catch (error) {
    console.error("Failed to fetch attendance logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
