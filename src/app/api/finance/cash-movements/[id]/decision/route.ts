import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cashMovementErrorResponse } from "@/lib/cash-movement-http";
import { decideCashMovement } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).nullish(),
});

/** Owner/Manajer menyetujui (uang bergerak sekarang) atau menolak pengajuan kas laci. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const row = await decideCashMovement(id, body.data, session.data);
    return ok({ id: row.id, refNo: row.refNo, status: row.status });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
