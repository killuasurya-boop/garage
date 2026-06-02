import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { announcements, user } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await requireGarageSession();
    if (session.response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();

    // Query announcements with author name
    const query = db
      .select({
        id: announcements.id,
        outletId: announcements.outletId,
        title: announcements.title,
        content: announcements.content,
        targetRole: announcements.targetRole,
        createdBy: announcements.createdBy,
        createdAt: announcements.createdAt,
        authorName: user.name,
      })
      .from(announcements)
      .leftJoin(user, eq(announcements.createdBy, user.id));

    const list = await query
      .orderBy(desc(announcements.createdAt))
      .limit(50);

    return NextResponse.json({ announcements: list });
  } catch (error) {
    console.error("Failed to fetch announcements:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const body = await req.json();
    const { title, content, targetRole, outletId } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const db = await getDb();
    const creatorId = session.data.user.id;

    await db.insert(announcements).values({
      outletId: outletId || null,
      title,
      content,
      targetRole: targetRole || "All",
      createdBy: creatorId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to create announcement:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
