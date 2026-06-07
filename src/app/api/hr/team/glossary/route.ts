import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { operationGlossary } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api-response";

export async function GET() {
  try {
    const session = await requireGarageSession();
    if (session.response) {
      return fail(401, "UNAUTHORIZED", "Unauthorized");
    }

    const db = await getDb();
    const list = await db.select().from(operationGlossary);

    return NextResponse.json({ glossary: list });
  } catch (error) {
    console.error("Failed to fetch glossary:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
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
        return fail(400, "VALIDATION_ERROR", "id is required for deletion");
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
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
