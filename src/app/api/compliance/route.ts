import { z } from "zod";
import { asc } from "drizzle-orm";

import { fail, ok, readJson } from "@/lib/api-response";
import { getDb } from "@/db";
import { complianceItems } from "@/db/schema";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  outletId: z.string().uuid().nullable().optional(),
  category: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  issuer: z.string().trim().max(160).nullable().optional(),
  refNumber: z.string().trim().max(80).nullable().optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reminderDays: z.number().int().min(1).max(365).optional(),
  attachmentUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

// Hitung status & sisa hari berdasarkan expiresAt.
function withDerivedStatus<
  T extends { expiresAt: string | null; status: string; reminderDays: number },
>(row: T): T & { daysToExpiry: number | null; derivedStatus: string } {
  if (!row.expiresAt) {
    return { ...row, daysToExpiry: null, derivedStatus: row.status === "archived" ? "archived" : "active" };
  }
  const now = new Date();
  const exp = new Date(`${row.expiresAt}T23:59:59+07:00`);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  let derivedStatus = row.status;
  if (row.status !== "archived") {
    if (diffDays < 0) derivedStatus = "expired";
    else if (diffDays <= row.reminderDays) derivedStatus = "grace";
    else derivedStatus = "active";
  }
  return { ...row, daysToExpiry: diffDays, derivedStatus };
}

export async function GET() {
  const session = await requireAnyPermission(["dashboard:read", "finance:read"]);
  if (session.response) return session.response;

  const db = await getDb();
  const rows = await db.select().from(complianceItems).orderBy(asc(complianceItems.expiresAt));

  const enriched = rows.map((r) =>
    withDerivedStatus({
      ...r,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
    }),
  );

  const summary = {
    total: enriched.length,
    active: enriched.filter((r) => r.derivedStatus === "active").length,
    grace: enriched.filter((r) => r.derivedStatus === "grace").length,
    expired: enriched.filter((r) => r.derivedStatus === "expired").length,
    archived: enriched.filter((r) => r.derivedStatus === "archived").length,
  };

  return ok({ items: enriched, summary });
}

export async function POST(request: Request) {
  const session = await requireAnyPermission(["finance:write", "dashboard:read"]);
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  try {
    const db = await getDb();
    const [created] = await db
      .insert(complianceItems)
      .values({
        outletId: body.data.outletId ?? null,
        category: body.data.category,
        name: body.data.name,
        issuer: body.data.issuer ?? null,
        refNumber: body.data.refNumber ?? null,
        issuedAt: body.data.issuedAt ?? null,
        expiresAt: body.data.expiresAt ?? null,
        reminderDays: body.data.reminderDays ?? 30,
        attachmentUrl: body.data.attachmentUrl ?? null,
        notes: body.data.notes ?? null,
        createdBy: session.data.user.id,
      })
      .returning();
    return ok(created);
  } catch (error) {
    console.error("compliance create error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menyimpan compliance item");
  }
}
