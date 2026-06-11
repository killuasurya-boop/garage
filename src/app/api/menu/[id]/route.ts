import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import {
  deleteMenuProduct,
  getMenuProductAuditHistory,
  updateMenuProduct,
  updateMenuProductStock,
} from "@/lib/garage-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const menuProductPatchSchema = z.object({
  stock: z.enum(["ready", "limited", "sold_out"]),
});

const menuProductUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().max(40).optional(),
  category: z.enum(["Makanan", "Cemilan", "Coffee", "Non-Coffee"]).optional(),
  section: z.string().trim().min(2).max(40).optional(),
  stock: z.enum(["ready", "limited", "sold_out"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
  prep: z.string().trim().min(1).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  promoActive: z.boolean().optional(),
  promoPrice: z.number().int().min(0).max(50_000_000).nullable().optional(),
  // URL foto menu; string kosong = hapus foto (pakai ikon kategori).
  imageUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64).optional(),
        label: z.string().trim().min(1).max(80),
        price: z.number().int().min(1).max(50_000_000),
        baseCost: z.number().int().min(0).max(50_000_000).optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
  recipes: z
    .array(
      z.object({
        variantId: z.string().trim().min(1).max(80).optional(),
        inventorySku: z.string().trim().min(1).max(80),
        qty: z.number().positive(),
        unit: z.string().trim().min(1).max(40).optional(),
        wastePct: z.number().min(0).max(100).optional(),
      }),
    )
    .max(24)
    .optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const history = url.searchParams.get("history") === "1";
  if (!history) {
    return fail(400, "MENU_PRODUCT_GET_INVALID", "Query produk tidak valid.");
  }

  const { id } = await context.params;
  const limit = Number(url.searchParams.get("limit"));
  return ok({
    rows: await getMenuProductAuditHistory(id, {
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const raw = await request.json().catch(() => null);
  const { id } = await context.params;
  const rawRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const isStockOnly =
    rawRecord &&
    Object.keys(rawRecord).length === 1 &&
    Object.prototype.hasOwnProperty.call(rawRecord, "stock");

  if (isStockOnly) {
    const session = await requirePermission("pos:use");
    if (session.response) {
      return session.response;
    }

    const body = menuProductPatchSchema.safeParse(raw);
    if (!body.success) {
      return fail(400, "MENU_PRODUCT_PATCH_INVALID", "Payload update stok tidak valid.");
    }

    const product = await updateMenuProductStock(id, body.data.stock, session.data);
    if (!product) {
      return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    }

    return ok({ product });
  }

  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  const body = menuProductUpdateSchema.safeParse(raw);
  if (!body.success || Object.keys(body.data).length === 0) {
    return fail(400, "MENU_PRODUCT_PATCH_INVALID", "Payload update produk tidak valid.");
  }

  try {
    const product = await updateMenuProduct(id, body.data, session.data);
    if (!product) {
      return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    }
    return ok({ product });
  } catch (error) {
    return fail(
      400,
      "MENU_PRODUCT_UPDATE_FAILED",
      error instanceof Error ? error.message : "Produk gagal diupdate.",
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const deleted = await deleteMenuProduct(id, session.data);
  if (!deleted) {
    return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
  }

  return ok({ deleted });
}
