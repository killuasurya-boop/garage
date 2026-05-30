import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createMenuProduct, getMenuData } from "@/lib/garage-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const menuProductSchema = z.object({
  id: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(120),
  category: z.enum(["Makanan", "Cemilan", "Coffee", "Non-Coffee"]),
  section: z.string().trim().min(2).max(40).optional(),
  stock: z.enum(["ready", "limited", "sold_out"]).optional(),
  prep: z.string().trim().min(1).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
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
    .max(8),
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

export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  if (
    includeArchived &&
    session.data.profile.role !== "Owner / CEO" &&
    session.data.profile.role !== "Admin"
  ) {
    return fail(403, "FORBIDDEN", "Hanya Owner/Admin yang boleh melihat produk arsip.");
  }

  return ok(
    await getMenuData({
      category: url.searchParams.get("category") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      includeArchived,
      includeCosting: includeArchived,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, menuProductSchema);
  if (body.error) return body.error;

  try {
    const product = await createMenuProduct(body.data, session.data);
    return ok({ product }, { status: 201 });
  } catch (error) {
    return fail(
      400,
      "MENU_PRODUCT_CREATE_FAILED",
      error instanceof Error ? error.message : "Produk gagal dibuat.",
    );
  }
}
