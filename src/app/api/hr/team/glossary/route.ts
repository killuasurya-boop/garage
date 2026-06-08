import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { operationGlossary } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail, readJson } from "@/lib/api-response";

const glossaryBodySchema = z.object({
  action: z.string().optional(),
  id: z.string().min(1).optional(),
  term: z.string().trim().min(1).max(200).optional(),
  definition: z.string().trim().min(1).max(4000).optional(),
  category: z.string().trim().max(120).optional(),
});

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

    const parsed = await readJson(req, glossaryBodySchema);
    if (parsed.error) return parsed.error;
    const { action, id, term, definition, category } = parsed.data;

    const db = await getDb();

    if (action === "delete") {
      if (!id) {
        return fail(400, "VALIDATION_ERROR", "id is required for deletion");
      }
      await db.delete(operationGlossary).where(eq(operationGlossary.id, id));
      return NextResponse.json({ success: true });
    }

    if (!term || !definition) {
      return fail(400, "VALIDATION_ERROR", "term dan definition wajib diisi");
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
        category: category ?? "",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to manage glossary:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
