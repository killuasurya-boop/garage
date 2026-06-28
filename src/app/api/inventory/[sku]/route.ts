import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  deleteInventoryItem,
  getInventoryData,
  getInventorySkuTimeline,
  getStockMovementsForSku,
  InventoryDeleteBlockedError,
  updateInventoryItem,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const inventoryPatchSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  alternativeName: z.string().trim().max(140).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  usageArea: z.enum(["bar", "dapur", "general"]).optional(),
  unit: z.string().trim().min(1).max(32).optional(),
  packageSize: z.string().trim().min(1).max(80).optional(),
  unitCost: z.number().int().min(0).max(100_000_000).optional(),
  onHand: z.number().nonnegative().optional(),
  min: z.number().nonnegative().optional(),
  status: z.enum(["safe", "watch", "low"]).optional(),
  stage: z.enum(["draft", "active", "archived"]).optional(),
  movement: z.string().trim().min(1).max(200).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ sku: string }> },
) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const { sku } = await context.params;
  const items = await getInventoryData();
  const item = items.find((i) => i.sku === sku);
  if (!item) {
    return fail(404, "INVENTORY_NOT_FOUND", "Inventory item tidak ditemukan.");
  }

  const movements = await getStockMovementsForSku(sku);
  const timeline = await getInventorySkuTimeline(sku);
  return ok({ item, movements, timeline });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sku: string }> },
) {
  const session = await requirePermission("inventory:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, inventoryPatchSchema);
  if (body.error) {
    return body.error;
  }

  const { sku } = await context.params;
  const item = await updateInventoryItem(sku, body.data, session.data);
  if (!item) {
    return fail(404, "INVENTORY_NOT_FOUND", "Inventory item was not found.");
  }

  return ok(item);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sku: string }> },
) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const { sku } = await context.params;
  try {
    const result = await deleteInventoryItem(sku);
    if (!result) {
      return fail(404, "INVENTORY_NOT_FOUND", "Bahan tidak ditemukan.");
    }
    return ok(result);
  } catch (error) {
    if (error instanceof InventoryDeleteBlockedError) {
      // 409 Conflict — sudah dipakai, sarankan arsipkan.
      return fail(409, "INVENTORY_DELETE_BLOCKED", error.message);
    }
    throw error;
  }
}
