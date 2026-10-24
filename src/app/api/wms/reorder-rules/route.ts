import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { listReorderRules, upsertReorderRule } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  minQty: z.number().nonnegative().max(10_000_000),
  maxQty: z.number().positive().max(10_000_000),
});

export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await listReorderRules());
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await upsertReorderRule(parsed.data));
  } catch (e) {
    return fail(400, "WMS_REORDER_RULE_FAILED", e instanceof Error ? e.message : "Gagal menyimpan aturan.");
  }
}
