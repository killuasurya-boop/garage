import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { productErrorResponse } from "@/lib/product-api";
import { CATALOG_BULK_ACTIONS } from "@/lib/product-catalog-types";
import { bulkProductAction } from "@/lib/product-management";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  ids: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
  action: z.enum(CATALOG_BULK_ACTIONS),
  value: z.string().trim().max(80).nullable().optional(),
});

/** POST /api/products/bulk — aksi massal aman (status, stok, menu digital, kategori, tipe). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  try {
    return ok(await bulkProductAction(body.data, session.data));
  } catch (error) {
    return productErrorResponse(error, "Aksi massal gagal.");
  }
}
