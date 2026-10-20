import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { productErrorResponse } from "@/lib/product-api";
import { CATEGORY_KINDS, CATEGORY_STATIONS, POS_GROUPS, PRODUCT_TYPES } from "@/lib/product-catalog-types";
import { archiveProductCategory, updateProductCategory } from "@/lib/product-management";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(240).nullable().optional(),
    kind: z.enum(CATEGORY_KINDS).optional(),
    defaultProductType: z.enum(PRODUCT_TYPES).optional(),
    station: z.enum(CATEGORY_STATIONS).optional(),
    posGroup: z.enum(POS_GROUPS).optional(),
    skuPrefix: z.string().trim().max(6).nullable().optional(),
    icon: z.string().trim().max(40).nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }),
  z.object({
    action: z.literal("archive"),
    moveToCategoryId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(240).nullable().optional(),
  }),
  z.object({ action: z.literal("restore") }),
]);

/**
 * PATCH /api/products/categories/:id
 * { action: "update", ...field } | { action: "archive", moveToCategoryId?, reason? } | { action: "restore" }
 * Tidak ada DELETE: kategori dipakai transaksi historis → arsip, bukan hapus.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, patchSchema);
  if (body.error) return body.error;
  try {
    const input = body.data;
    if (input.action === "archive") {
      return ok({ category: await archiveProductCategory(id, input, session.data) });
    }
    if (input.action === "restore") {
      return ok({ category: await updateProductCategory(id, { status: "active" }, session.data) });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { action, ...patch } = input;
    return ok({ category: await updateProductCategory(id, patch, session.data) });
  } catch (error) {
    return productErrorResponse(error, "Kategori gagal disimpan.");
  }
}
