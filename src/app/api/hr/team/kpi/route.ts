import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { kpiEvaluations, employeeAttendances, sopLogs } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq, lte, gte } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // YYYY-MM

    if (!period) {
      return NextResponse.json({ error: "period is required" }, { status: 400 });
    }

    const db = await getDb();

    // 1. Fetch saved KPI evaluations for the period
    const evaluations = await db
      .select()
      .from(kpiEvaluations)
      .where(eq(kpiEvaluations.period, period));

    // 2. We can compute real metrics for each active staff in this period!
    // Start of month: YYYY-MM-01, End of month: YYYY-MM-31
    const startDate = `${period}-01`;
    const endDate = `${period}-31`;

    // Fetch all attendance logs in this period
    const attendanceLogs = await db
      .select()
      .from(employeeAttendances)
      .where(
        and(
          gte(employeeAttendances.timestamp, new Date(startDate)),
          lte(employeeAttendances.timestamp, new Date(endDate))
        )
      );

    // Fetch all SOP logs in this period
    const sLogs = await db
      .select()
      .from(sopLogs)
      .where(
        and(
          gte(sopLogs.date, startDate),
          lte(sopLogs.date, endDate)
        )
      );

    return NextResponse.json({ 
      evaluations, 
      metrics: {
        attendanceCount: attendanceLogs.length,
        sopCount: sLogs.length,
        attendanceLogs,
        sopLogs: sLogs
      } 
    });
  } catch (error) {
    console.error("Failed to fetch KPI data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const body = await req.json();
    const { staffId, period, score, feedback } = body; // { staffId, period, score, feedback }

    if (!staffId || !period || score === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await getDb();
    const evaluatorId = session.data.user.id;

    // Check if an evaluation already exists for this staff and period
    const [existing] = await db
      .select()
      .from(kpiEvaluations)
      .where(
        and(
          eq(kpiEvaluations.staffId, staffId),
          eq(kpiEvaluations.period, period)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing evaluation
      await db
        .update(kpiEvaluations)
        .set({
          score: parseFloat(score),
          feedback: feedback || null,
          evaluatorId,
          updatedAt: new Date(),
        })
        .where(eq(kpiEvaluations.id, existing.id));
    } else {
      // Insert new evaluation
      await db.insert(kpiEvaluations).values({
        staffId,
        period,
        score: parseFloat(score),
        feedback: feedback || null,
        evaluatorId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save KPI evaluation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
