import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { trainingProgress } from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: session, response } = await requireGarageSession();
    if (response) return response;

    const { id: courseId } = await params;
    const db = getDb();

    // Cek apakah sudah ada progress
    const existing = await db.select().from(trainingProgress).where(
      and(
        eq(trainingProgress.userId, session.user.id),
        eq(trainingProgress.courseId, courseId)
      )
    ).limit(1);

    if (existing.length > 0) {
      await db.update(trainingProgress).set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(trainingProgress.id, existing[0].id));
    } else {
      await db.insert(trainingProgress).values({
        userId: session.user.id,
        courseId: courseId,
        status: "completed",
        completedAt: new Date()
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Training Complete API Error:", error);
    return fail(500, "INTERNAL_ERROR", "Internal Server Error");
  }
}
