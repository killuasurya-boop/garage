import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLogs, staffPayoutRequests } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

const schema = z.object({
  reason: z.string().min(3).max(500),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Ctx) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .select()
      .from(staffPayoutRequests)
      .where(and(eq(staffPayoutRequests.id, id), eq(staffPayoutRequests.status, "pending")))
      .limit(1);
    if (!row) return fail(404, "PAYOUT_NOT_FOUND", "Payout tidak ditemukan / bukan pending.");

    const [updated] = await db
      .update(staffPayoutRequests)
      .set({
        status: "rejected",
        reviewedBy: session.data!.user.id,
        reviewedAt: now,
        reviewNote: body.data.reason,
      })
      .where(eq(staffPayoutRequests.id, id))
      .returning();

    await db.insert(auditLogs).values({
      time: now.toISOString(),
      actor: session.data!.user.id,
      action: "payout_reject",
      object: `payout=${id}`,
      device: "web",
      status: "success",
      metadata: { reason: body.data.reason } as Record<string, unknown>,
    });

    return ok({ request: updated });
  } catch (err) {
    return fail(500, "PAYOUT_REJECT_FAILED", (err as Error).message);
  }
}
