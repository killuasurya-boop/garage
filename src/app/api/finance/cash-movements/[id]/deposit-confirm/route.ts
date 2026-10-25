import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cashMovementErrorResponse } from "@/lib/cash-movement-http";
import { confirmCashDeposit } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  bankRef: z.string().trim().min(3).max(80),
  note: z.string().trim().max(300).nullish(),
});

/** Penerima (Owner/Manajer lain) mengonfirmasi setoran laci sudah masuk Rekening Jago/BNI. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const row = await confirmCashDeposit(id, body.data, session.data);
    return ok({ id: row.id, refNo: row.refNo, depositConfirmedAt: row.depositConfirmedAt?.toISOString() ?? null });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
