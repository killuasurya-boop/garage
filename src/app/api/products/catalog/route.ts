import { fail, ok } from "@/lib/api-response";
import { validateDateRange } from "@/lib/date-range";
import { productErrorResponse } from "@/lib/product-api";
import { parseCatalogQuery } from "@/lib/product-catalog-query";
import { getProductCatalog } from "@/lib/product-management";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/products/catalog?q=&categoryId=&productType=&status=&stock=&hpp=&issue=
 *   &digital=&from=&to=&sort=&dir=&page=&pageSize=
 * Katalog produk + KPI (dihitung dari DB). Owner/Manajer: memuat HPP & margin.
 */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const parsed = parseCatalogQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.message);
  if (parsed.query.from || parsed.query.to) {
    const range = validateDateRange(parsed.query.from ?? "", parsed.query.to ?? "", { maxDays: 366 });
    if (!range.ok) return fail(400, range.code, range.message);
  }
  try {
    return ok(await getProductCatalog(parsed.query));
  } catch (error) {
    return productErrorResponse(error, "Katalog produk gagal dimuat.");
  }
}
