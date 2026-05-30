import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createOwnerAdjustment } from "@/lib/garage-earnings";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const adjustSchema = z.object({
  staffUserId: z.string().min(1),
  amount: z.number().int().min(-50_000_000).max(50_000_000).refine((value) => value !== 0, {
    message: "Nominal tidak boleh nol.",
  }),
  note: z.string().trim().max(160).optional(),
});

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, adjustSchema);
  if (body.error) return body.error;

  const result = await createOwnerAdjustment({
    staffUserId: body.data.staffUserId,
    amount: body.data.amount,
    note: body.data.note,
    outletId: session.data.profile.outlet.id,
  });

  if (!result.row) {
    return fail(404, "STAFF_NOT_FOUND", "Staff tidak ditemukan.");
  }

  return ok({ earning: result.row });
}
