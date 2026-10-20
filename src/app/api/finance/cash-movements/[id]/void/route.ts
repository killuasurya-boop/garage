import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { cashMovementErrorResponse } from "@/lib/cash-movement-http";
import { voidCashMovement } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi.").max(300) });

/** Batalkan transaksi kas laci tercatat (shift masih buka). Tidak pernah dihapus. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const row = await voidCashMovement(id, body.data.reason, session.data);
    return ok({ id: row.id, refNo: row.refNo, status: row.status });
  } catch (error) {
    const response = cashMovementErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
