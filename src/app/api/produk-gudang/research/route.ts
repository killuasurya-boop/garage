import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  createMenuResearch,
  listMenuResearch,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  productName: z.string().trim().min(2).max(140),
  productId: z.string().trim().max(120).optional().nullable(),
  tasteNotes: z.string().trim().max(2000).optional(),
  recipeNotes: z.string().trim().max(2000).optional(),
  hppNotes: z.string().trim().max(1000).optional(),
  sellingPriceNotes: z.string().trim().max(1000).optional(),
  decision: z.enum(["research", "revise", "approved", "rejected"]).optional(),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listMenuResearch());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;

  return ok(await createMenuResearch(parsed.data, session.data));
}
