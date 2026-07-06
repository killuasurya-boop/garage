import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { addRecipeBomLine } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("lineType", [
  z.object({
    lineType: z.enum(["ingredient", "packaging"]),
    productId: z.string().uuid(),
    qty: z.number().positive(),
    wastePct: z.number().min(0).max(100).optional(),
  }),
  z.object({
    lineType: z.literal("sub_recipe"),
    subRecipeId: z.string().uuid(),
    qty: z.number().positive(),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await addRecipeBomLine(id, parsed.data), { status: 201 });
  } catch (e) {
    return fail(400, "BOM_ADD_FAILED", e instanceof Error ? e.message : "Gagal tambah BOM.");
  }
}
