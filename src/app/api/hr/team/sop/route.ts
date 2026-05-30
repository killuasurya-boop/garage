import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sopChecklists, sopLogs } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const db = await getDb();

    // 1. Fetch all active SOP checklists
    const checklists = await db
      .select()
      .from(sopChecklists)
      .where(eq(sopChecklists.status, "active"));

    // 2. Fetch logs for this specific date
    const logs = await db
      .select()
      .from(sopLogs)
      .where(eq(sopLogs.date, date));

    return NextResponse.json({ checklists, logs });
  } catch (error) {
    console.error("Failed to fetch SOP data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const body = await req.json();
    const { action } = body;

    const db = await getDb();

    if (action === "manage_template") {
      const { template } = body; // { id?, title, description, roleTarget, shiftTarget, outletId, status }
      
      if (!template.title || !template.roleTarget || !template.shiftTarget || !template.outletId) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      if (template.id) {
        // Update master checklist item
        await db
          .update(sopChecklists)
          .set({
            title: template.title,
            description: template.description || null,
            roleTarget: template.roleTarget,
            shiftTarget: template.shiftTarget,
            status: template.status || "active",
            updatedAt: new Date(),
          })
          .where(eq(sopChecklists.id, template.id));
      } else {
        // Insert new master checklist item
        await db.insert(sopChecklists).values({
          title: template.title,
          description: template.description || null,
          roleTarget: template.roleTarget,
          shiftTarget: template.shiftTarget,
          outletId: template.outletId,
          status: "active",
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "log_task") {
      const { log } = body; // { checklistId, staffId, date, status, notes }

      if (!log.checklistId || !log.staffId || !log.date || !log.status) {
        return NextResponse.json({ error: "Missing required fields for logging" }, { status: 400 });
      }

      // Check if a log entry already exists
      const [existing] = await db
        .select()
        .from(sopLogs)
        .where(
          and(
            eq(sopLogs.checklistId, log.checklistId),
            eq(sopLogs.date, log.date)
          )
        )
        .limit(1);

      if (existing) {
        // Update log entry
        await db
          .update(sopLogs)
          .set({
            staffId: log.staffId,
            status: log.status,
            notes: log.notes || null,
          })
          .where(eq(sopLogs.id, existing.id));
      } else {
        // Insert new log entry
        await db.insert(sopLogs).values({
          checklistId: log.checklistId,
          staffId: log.staffId,
          date: log.date,
          status: log.status,
          notes: log.notes || null,
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to manage SOP:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
