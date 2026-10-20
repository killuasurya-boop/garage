import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { productErrorResponse } from "@/lib/product-api";
import { CATEGORY_KINDS, CATEGORY_STATIONS, POS_GROUPS, PRODUCT_TYPES } from "@/lib/product-catalog-types";
import { createProductCategory, listProductCategories } from "@/lib/product-management";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).nullable().optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  defaultProductType: z.enum(PRODUCT_TYPES).optional(),
  station: z.enum(CATEGORY_STATIONS).optional(),
  posGroup: z.enum(POS_GROUPS).optional(),
  skuPrefix: z.string().trim().max(6).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

/** GET /api/products/categories?includeArchived=1 — master kategori + jumlah produk. */
export async function GET(request: Request) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1" &&
    (session.data.profile.role === "Owner" || session.data.profile.role === "Manajer");
  try {
    return ok({ categories: await listProductCategories({ includeArchived }) });
  } catch (error) {
    return productErrorResponse(error, "Kategori gagal dimuat.");
  }
}

/** POST /api/products/categories — tambah kategori (Owner/Manajer). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, categorySchema);
  if (body.error) return body.error;
  try {
    return ok({ category: await createProductCategory(body.data, session.data) }, { status: 201 });
  } catch (error) {
    return productErrorResponse(error, "Kategori gagal dibuat.");
  }
}
