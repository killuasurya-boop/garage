import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createInventoryItem, getInventoryData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const inventoryCreateSchema = z.object({
  sku: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(140),
  alternativeName: z.string().trim().max(140).optional(),
  category: z.string().trim().min(2).max(80),
  usageArea: z.enum(["bar", "dapur", "general"]).optional(),
  unit: z.string().trim().min(1).max(32),
  packageSize: z.string().trim().min(1).max(80),
  unitCost: z.number().int().min(0).max(100_000_000).optional(),
  onHand: z.number().nonnegative(),
  min: z.number().nonnegative(),
  movement: z.string().trim().min(3).max(200).optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  return ok(
    await getInventoryData({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      usageArea: url.searchParams.get("usageArea") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    }),
  );
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, inventoryCreateSchema);
  if (body.error) return body.error;

  try {
    const item = await createInventoryItem(body.data, session.data);
    return ok(item, { status: 201 });
  } catch (error) {
    return fail(
      400,
      "WAREHOUSE_SKU_CREATE_FAILED",
      error instanceof Error ? error.message : "SKU gudang gagal dibuat.",
    );
  }
}
