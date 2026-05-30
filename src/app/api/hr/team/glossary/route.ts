import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { operationGlossary } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const session = await requireGarageSession();
    if (session.response) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    const list = await db.select().from(operationGlossary);

    return NextResponse.json({ glossary: list });
  } catch (error) {
    console.error("Failed to fetch glossary:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const body = await req.json();
    const { action, id, term, definition, category } = body;

    const db = await getDb();

    if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "id is required for deletion" }, { status: 400 });
      }
      await db.delete(operationGlossary).where(eq(operationGlossary.id, id));
      return NextResponse.json({ success: true });
    }

    if (id) {
      // Update
      await db
        .update(operationGlossary)
        .set({
          term,
          definition,
          category,
        })
        .where(eq(operationGlossary.id, id));
    } else {
      // Create
      await db.insert(operationGlossary).values({
        term,
        definition,
        category,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to manage glossary:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
