import { fail } from "@/lib/api-response";
import { getClosingCatalog } from "@/lib/wms-replenishment";
import { closingDivisionSchema } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const parsed = closingDivisionSchema.safeParse(new URL(request.url).searchParams.get("division"));
  if (!parsed.success) return fail(400, "DIVISION_REQUIRED", "Pilih divisi Bar atau Dapur.");
  try { return replenishmentOk(await getClosingCatalog(session.actor, parsed.data)); }
  catch (error) { return replenishmentFailure(error); }
}
