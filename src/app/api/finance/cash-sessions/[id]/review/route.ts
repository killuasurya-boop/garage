import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import { reviewCashSession } from "@/lib/cashier-accountability";
import { scanRiskInBackground } from "@/lib/risk-engine";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const reviewSchema = z.object({
  status: z.enum(["verified", "needs_followup"]),
  note: z.string().trim().max(1000).optional(),
  recountDenominations: z.record(z.string(), z.number().int().min(0).max(100_000)).nullable().optional(),
  acknowledgeDiscrepancy: z.boolean().optional(),
});

/** Pemeriksaan laporan shift oleh Manajer/Owner (status verifikasi di PDF). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, reviewSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    const result = await reviewCashSession(id, body.data, session.data);
    scanRiskInBackground(id);
    return ok(result);
  } catch (error) {
    return accountabilityFailure(error);
  }
}
