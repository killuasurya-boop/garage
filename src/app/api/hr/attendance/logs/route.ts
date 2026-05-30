import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { employeeAttendances, staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { eq, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const db = await getDb();

    // In a real app we would join employeeAttendances with staffProfiles and user
    // However, for simplicity without complex join definitions, we'll fetch them separately
    // or use a drizzle query if relations are defined. 
    // Wait, Drizzle allows simple joins using query builder. Let's use standard select join.
    const logs = await db
      .select({
        id: employeeAttendances.id,
        action: employeeAttendances.action,
        timestamp: employeeAttendances.timestamp,
        role: staffProfiles.role,
        userId: staffProfiles.userId,
      })
      .from(employeeAttendances)
      .leftJoin(staffProfiles, eq(employeeAttendances.staffId, staffProfiles.id))
      .orderBy(desc(employeeAttendances.timestamp))
      .limit(100);

    // Fetch user names manually since we don't know if foreign keys are configured for query builder
    const userIds = Array.from(new Set(logs.map(l => l.userId).filter(Boolean))) as string[];
    let usersData: Array<{ id: string; name: string }> = [];
    if (userIds.length > 0) {
      usersData = await db
        .select({ id: user.id, name: user.name })
        .from(user);
    }
    const userMap = new Map(usersData.map(u => [u.id, u.name]));

    const enrichedLogs = logs.map(log => ({
      ...log,
      name: log.userId ? userMap.get(log.userId) || "Unknown Staff" : "Unknown Staff",
    }));

    return NextResponse.json({ logs: enrichedLogs });
  } catch (error) {
    console.error("Failed to fetch attendance logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
