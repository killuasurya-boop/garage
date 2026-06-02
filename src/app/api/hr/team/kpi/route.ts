import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { kpiEvaluations, employeeAttendances, sopLogs } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq, lt, lte, gte } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // YYYY-MM

    // Validasi format period YYYY-MM (cegah bulan/tahun ngawur).
    const match = /^(\d{4})-(\d{2})$/.exec(period ?? "");
    if (!period || !match) {
      return NextResponse.json({ error: "period wajib format YYYY-MM" }, { status: 400 });
    }
    const year = Number(match[1]);
    const monthNum = Number(match[2]); // 1-12
    if (monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: "bulan period tidak valid" }, { status: 400 });
    }

    const db = await getDb();

    // 1. Fetch saved KPI evaluations for the period
    const evaluations = await db
      .select()
      .from(kpiEvaluations)
      .where(eq(kpiEvaluations.period, period));

    // 2. Rentang tanggal yang BENAR per panjang bulan (bukan hardcode -31 yang
    //    bikin Juni/Feb error). lastDay = hari ke-0 bulan berikutnya.
    const lastDay = new Date(year, monthNum, 0).getDate(); // 28/29/30/31
    const startDate = `${period}-01`;
    const endDate = `${period}-${String(lastDay).padStart(2, "0")}`;
    const startTs = new Date(`${startDate}T00:00:00.000Z`);
    const endExclusiveTs = new Date(Date.UTC(year, monthNum, 1)); // awal bulan berikutnya

    // Fetch all attendance logs in this period (timestamp: pakai batas eksklusif
    // awal bulan berikutnya agar punch sepanjang hari terakhir tetap terhitung)
    const attendanceLogs = await db
      .select()
      .from(employeeAttendances)
      .where(
        and(
          gte(employeeAttendances.timestamp, startTs),
          lt(employeeAttendances.timestamp, endExclusiveTs)
        )
      );

    // Fetch all SOP logs in this period (kolom date: inklusif hari terakhir)
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
