import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { staffAdvances, staffProfiles, user } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api-response";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // YYYY-MM

    if (!period) {
      return fail(400, "VALIDATION_ERROR", "period is required");
    }

    const db = await getDb();

    // Query cash advances in this period with employee names
    const list = await db
      .select({
        id: staffAdvances.id,
        staffId: staffAdvances.staffId,
        period: staffAdvances.period,
        amount: staffAdvances.amount,
        reason: staffAdvances.reason,
        status: staffAdvances.status,
        createdAt: staffAdvances.createdAt,
        name: user.name,
        role: staffProfiles.role,
      })
      .from(staffAdvances)
      .innerJoin(staffProfiles, eq(staffAdvances.staffId, staffProfiles.id))
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .where(eq(staffAdvances.period, period));

    return NextResponse.json({ advances: list });
  } catch (error) {
    console.error("Failed to fetch cash advances:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const body = await req.json();
    const { action } = body;

    const db = await getDb();
    const evaluatorId = session.data.user.id;

    if (action === "request") {
      const { staffId, period, amount, reason } = body;

      if (!staffId || !period || !amount) {
        return fail(400, "VALIDATION_ERROR", "Missing required fields for request");
      }

      await db.insert(staffAdvances).values({
        staffId,
        period,
        amount: parseInt(amount),
        reason: reason || null,
        status: "pending",
      });

      return NextResponse.json({ success: true });
    }

    if (action === "approve") {
      const { id } = body;

      if (!id) {
        return fail(400, "VALIDATION_ERROR", "id is required for approval");
      }

      await db
        .update(staffAdvances)
        .set({
          status: "approved",
          approvedBy: evaluatorId,
          updatedAt: new Date(),
        })
        .where(eq(staffAdvances.id, id));

      return NextResponse.json({ success: true });
    }

    if (action === "reject") {
      const { id } = body;

      if (!id) {
        return fail(400, "VALIDATION_ERROR", "id is required for rejection");
      }

      await db
        .update(staffAdvances)
        .set({
          status: "rejected",
          approvedBy: evaluatorId,
          updatedAt: new Date(),
        })
        .where(eq(staffAdvances.id, id));

      return NextResponse.json({ success: true });
    }

    return fail(400, "INVALID_ACTION", "Invalid action");
  } catch (error) {
    console.error("Failed to manage cash advances:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
