import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { importWmsRecipesFromBundle } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const sopStepSchema = z.object({
  order: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  durationMin: z.number().nonnegative().max(9999).optional().default(0),
  notes: z.string().trim().max(500).optional().default(""),
});

const bomSchema = z.object({
  lineType: z.string().optional(),
  productName: z.string().optional(),
  sku: z.string().optional(),
  qty: z.number().positive(),
  unit: z.string().optional(),
  wastePct: z.number().min(0).max(100).optional(),
  shrinkagePct: z.number().min(0).max(100).optional(),
  subRecipeId: z.string().uuid().optional(),
});

const recipeSchema = z.object({
  name: z.string().trim().min(2).max(140),
  recipeSku: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  productionArea: z.string().optional(),
  yieldQty: z.string().optional(),
  yieldUnit: z.string().optional(),
  sellPrice: z.number().nonnegative().optional(),
  description: z.string().optional(),
  sopSteps: z.array(sopStepSchema).optional(),
  source: z.string().optional(),
  bom: z.array(bomSchema).optional(),
});

const importSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  recipes: z.array(recipeSchema).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, importSchema);
  if (parsed.error) return parsed.error;
  try {
    const { dryRun, recipes } = parsed.data;
    const normalized = recipes.map((r) => ({
      ...r,
      sopSteps: r.sopSteps?.map((s, i) => ({
        order: s.order ?? i + 1,
        title: s.title,
        durationMin: s.durationMin,
        notes: s.notes,
      })),
    }));
    return ok(await importWmsRecipesFromBundle({ recipes: normalized }, { dryRun }));
  } catch (e) {
    return fail(400, "IMPORT_FAILED", e instanceof Error ? e.message : "Gagal import resep.");
  }
}
