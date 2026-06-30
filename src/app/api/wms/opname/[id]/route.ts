import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getWmsOpname, saveWmsOpnameLine } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({ lineId: z.string().uuid(), physicalQty: z.number().nonnegative() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const op = await getWmsOpname(id);
  if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
  return ok(op);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const row = await saveWmsOpnameLine(parsed.data.lineId, parsed.data.physicalQty);
  if (!row) return fail(404, "LINE_NOT_FOUND", "Baris opname tidak ditemukan.");
  return ok({ id: row.id });
}
