import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cashMovementBodySchema, cashMovementErrorResponse } from "@/lib/cash-movement-http";
import { correctCashMovement } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = cashMovementBodySchema.extend({
  categoryKey: z.string().trim().min(2).max(40),
  reason: z.string().trim().min(3, "Alasan koreksi wajib diisi.").max(300),
});

/** Koreksi: batalkan baris lama + catat baris pengganti di shift yang sama. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const row = await correctCashMovement(id, body.data, session.data);
    return ok({ id: row.id, refNo: row.refNo, status: row.status });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
