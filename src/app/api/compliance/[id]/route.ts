import { z } from "zod";
import { eq } from "drizzle-orm";

import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { complianceItems } from "@/db/schema";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  category: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  issuer: z.string().trim().max(160).nullable().optional(),
  refNumber: z.string().trim().max(80).nullable().optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reminderDays: z.number().int().min(1).max(365).optional(),
  attachmentUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["active", "grace", "expired", "archived"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "dashboard:read"]);
  if (session.response) return session.response;

  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;

  const { id } = await context.params;
  try {
    const db = await getDb();
    const [updated] = await db
      .update(complianceItems)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(complianceItems.id, id))
      .returning();
    if (!updated) return fail(404, "NOT_FOUND", "Compliance item tidak ditemukan");
    return ok(updated);
  } catch (error) {
    console.error("compliance patch error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal update compliance item");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write"]);
  if (session.response) return session.response;

  const { id } = await context.params;
  try {
    const db = await getDb();
    const [deleted] = await db
      .delete(complianceItems)
      .where(eq(complianceItems.id, id))
      .returning();
    if (!deleted) return fail(404, "NOT_FOUND", "Compliance item tidak ditemukan");
    return ok({ deleted: deleted.id });
  } catch (error) {
    console.error("compliance delete error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menghapus compliance item");
  }
}
