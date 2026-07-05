import { ok } from "@/lib/api-response";
import { getWmsRecipeCoverage, syncOsInventoryToWms, syncOsRecipesToWms } from "@/lib/wms-bridge";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tarik resep/BOM dari Produk Manajemen OS → wms_recipe (produk bahan disinkron dulu). */
export async function POST() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) return session.response;
  const products = await syncOsInventoryToWms({ bootstrapStock: false });
  const recipes = await syncOsRecipesToWms();
  const coverage = await getWmsRecipeCoverage();
  return ok({
    products,
    recipes,
    coverage,
    syncedAt: new Date().toISOString(),
  });
}
