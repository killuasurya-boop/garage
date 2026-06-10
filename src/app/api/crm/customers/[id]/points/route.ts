import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { adjustCrmMemberPoints } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const adjustSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "Nilai poin tidak boleh 0.").gte(-1_000_000).lte(1_000_000),
  reason: z.string().trim().min(3, "Alasan wajib diisi.").max(240),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
  ]);
  if (session.response) return session.response;

  const body = await readJson(request, adjustSchema);
  if (body.error) return body.error;

  const { id } = await context.params;
  const result = await adjustCrmMemberPoints({
    customerId: id,
    delta: body.data.delta,
    reason: body.data.reason,
    actor: session.data,
  });
  if (!result.data) {
    return fail(404, "MEMBER_NOT_FOUND", result.error ?? "Member tidak ditemukan.");
  }
  return ok(result.data);
}
