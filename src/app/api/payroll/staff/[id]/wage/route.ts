import { z } from "zod";

import { getDb } from "@/db";
import { staffWageConfig } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const OWNER_ROLES = ["Owner / CEO", "Admin", "Finance / CFO"] as const;

const schema = z.object({
  dailyWage: z.number().int().min(0).max(10_000_000),
  overtimeHourly: z.number().int().min(0).max(1_000_000).optional(),
  monthlyDeduction: z.number().int().min(0).max(10_000_000).optional(),
  notes: z.string().max(500).optional().nullable(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const session = await requireGarageSession([...OWNER_ROLES]);
  if (session.response) return session.response;

  const { id } = await params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  try {
    const db = getDb();
    const now = new Date();
    await db
      .insert(staffWageConfig)
      .values({
        staffUserId: id,
        dailyWage: body.data.dailyWage,
        overtimeHourly: body.data.overtimeHourly ?? 0,
        monthlyDeduction: body.data.monthlyDeduction ?? 0,
        notes: body.data.notes ?? null,
        updatedBy: session.data!.user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: staffWageConfig.staffUserId,
        set: {
          dailyWage: body.data.dailyWage,
          overtimeHourly: body.data.overtimeHourly ?? 0,
          monthlyDeduction: body.data.monthlyDeduction ?? 0,
          notes: body.data.notes ?? null,
          updatedBy: session.data!.user.id,
          updatedAt: now,
        },
      });
    return ok({ staffUserId: id, updated: true });
  } catch (err) {
    return fail(500, "WAGE_UPDATE_FAILED", (err as Error).message);
  }
}
