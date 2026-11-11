import { z } from "zod";

import { PRODUCT_TYPES } from "@/lib/product-catalog-types";
import { fail, ok } from "@/lib/api-response";
import {
  deleteMenuProduct,
  getMenuProductAuditHistory,
  getMenuProductOrderCount,
  PartnerProductStockError,
  updateMenuProduct,
  updateMenuProductStock,
} from "@/lib/garage-service";
import { count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { eventMenuEntries, menuItems } from "@/db/schema";
import { canOperateStation, productionStationFor } from "@/lib/garage-production-rules";
import { canUseApiAs } from "@/lib/role-access";
import { requireAnyPermission, requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const menuProductPatchSchema = z.object({
  stock: z.enum(["ready", "limited", "sold_out"]),
});

const menuProductUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().max(40).optional(),
  // Kategori dinamis: divalidasi terhadap master product_categories di service.
  category: z.string().trim().min(2).max(60).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  barcode: z.string().trim().max(40).nullable().optional(),
  section: z.string().trim().min(2).max(40).optional(),
  stock: z.enum(["ready", "limited", "sold_out"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
  prep: z.string().trim().min(1).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  promoActive: z.boolean().optional(),
  promoPrice: z.number().int().min(0).max(50_000_000).nullable().optional(),
  // Production Hub: routing station (null = otomatis dari kategori) & Smart Batch.
  station: z.enum(["bar", "dapur", "none"]).nullable().optional(),
  batchEligible: z.boolean().optional(),
  // Menu digital: tampil di QR order & banner unggulan.
  showInDigitalMenu: z.boolean().optional(),
  featured: z.boolean().optional(),
  // Deskripsi singkat menu digital; string kosong/null = hapus.
  description: z.string().trim().max(120).nullable().optional(),
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
        sku: z.string().trim().max(40).nullable().optional(),
        barcode: z.string().trim().max(40).nullable().optional(),
        sellUnit: z.string().trim().max(20).nullable().optional(),
        unitContents: z.number().positive().max(100_000).nullable().optional(),
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
  const session = await requireGarageSession(["Owner", "Manajer"]);
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
    // Kasir (POS) atau Bar/Dapur (Production Hub) boleh menandai stok habis;
    // akun produksi hanya untuk menu di station-nya.
    const session = await requireAnyPermission(["pos:use", "kitchen:write"]);
    if (session.response) {
      return session.response;
    }
    if (!canUseApiAs(session.data.profile, "pos:use")) {
      const [menu] = await getDb()
        .select({ station: menuItems.station, category: menuItems.category })
        .from(menuItems)
        .where(eq(menuItems.id, id))
        .limit(1);
      if (!menu) return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
      if (
        !canOperateStation(session.data.profile.role, session.data.profile.workstation, productionStationFor(menu))
      ) {
        return fail(403, "FORBIDDEN", "Menu ini bukan station Anda.");
      }
    }

    const body = menuProductPatchSchema.safeParse(raw);
    if (!body.success) {
      return fail(400, "MENU_PRODUCT_PATCH_INVALID", "Payload update stok tidak valid.");
    }

    let product: Awaited<ReturnType<typeof updateMenuProductStock>>;
    try {
      product = await updateMenuProductStock(id, body.data.stock, session.data);
    } catch (error) {
      if (error instanceof PartnerProductStockError) return fail(409, error.code, error.message);
      throw error;
    }
    if (!product) {
      return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    }

    return ok({ product });
  }

  const session = await requireGarageSession(["Owner", "Manajer"]);
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
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;

  // ?guard=1 → tolak hapus permanen bila produk pernah terjual; sarankan Arsipkan.
  const guard = new URL(request.url).searchParams.get("guard") === "1";
  if (guard) {
    const used = await getMenuProductOrderCount(id);
    if (used > 0) {
      return fail(
        409,
        "MENU_DELETE_BLOCKED",
        "Produk ini sudah pernah terjual. Riwayat penjualan tetap aman, tapi sebaiknya Arsipkan saja, jangan hapus permanen.",
      );
    }
  }

  // Produk yang dipakai di menu event/paket tidak bisa dihapus (FK RESTRICT) —
  // beri pesan jelas, bukan error database.
  const [eventUse] = await getDb()
    .select({ n: count(eventMenuEntries.id) })
    .from(eventMenuEntries)
    .where(eq(eventMenuEntries.menuItemId, id.trim()));
  if (Number(eventUse?.n ?? 0) > 0) {
    return fail(
      409,
      "MENU_IN_EVENT",
      "Produk ini dipakai di menu event/paket. Arsipkan saja (hilang dari POS & menu digital), atau keluarkan dulu dari event.",
    );
  }

  const deleted = await deleteMenuProduct(id, session.data);
  if (!deleted) {
    return fail(404, "MENU_PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
  }

  return ok({ deleted });
}
