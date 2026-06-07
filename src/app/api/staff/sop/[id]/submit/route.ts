import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { sopLogs, staffProfiles } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: session, response } = await requireGarageSession();
    if (response) return response;

    const { id: checklistId } = await params;
    const db = getDb();

    const [staffProfile] = await db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, session.user.id))
      .limit(1);

    if (!staffProfile) {
      return fail(400, "STAFF_PROFILE_NOT_FOUND", "Staff profile not found");
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const existingLog = await db.select().from(sopLogs).where(
      and(
        eq(sopLogs.checklistId, checklistId),
        eq(sopLogs.staffId, staffProfile.id),
        eq(sopLogs.date, today)
      )
    ).limit(1);

    if (existingLog.length > 0) {
      await db.update(sopLogs).set({
        status: "done",
        notes: ""
      }).where(eq(sopLogs.id, existingLog[0].id));
    } else {
      await db.insert(sopLogs).values({
        checklistId: checklistId,
        staffId: staffProfile.id,
        date: today,
        status: "done"
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SOP Submit API Error:", error);
    return fail(500, "INTERNAL_ERROR", "Internal Server Error");
  }
}
