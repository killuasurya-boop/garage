import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createPaymentSettlement } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const settlementSchema = z.object({
  settlementNo: z.string().trim().min(2).max(80),
  method: z.string().trim().min(2).max(60),
  provider: z.string().trim().min(2).max(80),
  expectedAmount: z.number().int().nonnegative(),
  settledAmount: z.number().int().nonnegative().optional(),
  feeAmount: z.number().int().nonnegative().optional(),
  status: z.enum(["pending", "processing", "settled", "mismatch"]).optional(),
  settlementDate: z.string().datetime({ offset: true }),
  settledAt: z.string().datetime({ offset: true }).nullable().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, settlementSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createPaymentSettlement(body.data, session.data), { status: 201 });
}
