import { z } from "zod";
import { fail, readJson } from "@/lib/api-response";
import { transitionReplenishment } from "@/lib/wms-replenishment";
import { replenishmentActionSchema } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "ID_INVALID", "ID permintaan tidak valid.");
  const input = await readJson(request, replenishmentActionSchema);
  if (input.error) return input.error;
  try { return replenishmentOk(await transitionReplenishment(session.actor, id, input.data)); }
  catch (error) { return replenishmentFailure(error); }
}
