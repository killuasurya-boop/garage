import { z } from "zod";
import { fail, readJson } from "@/lib/api-response";
import { getReplenishment, saveClosing } from "@/lib/wms-replenishment";
import { saveClosingSchema } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "ID_INVALID", "ID permintaan tidak valid.");
  try { return replenishmentOk(await getReplenishment(session.actor, id)); }
  catch (error) { return replenishmentFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "ID_INVALID", "ID permintaan tidak valid.");
  const input = await readJson(request, saveClosingSchema);
  if (input.error) return input.error;
  if (input.data.id && input.data.id !== id) return fail(400, "ID_MISMATCH", "ID draft tidak sesuai dengan alamat permintaan.");
  if (!input.data.version) return fail(400, "VERSION_REQUIRED", "Versi draft wajib diisi.");
  try { return replenishmentOk(await saveClosing(session.actor, { ...input.data, id })); }
  catch (error) { return replenishmentFailure(error); }
}
