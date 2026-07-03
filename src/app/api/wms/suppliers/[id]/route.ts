import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { archiveWmsSupplier, updateWmsSupplier } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const row = await updateWmsSupplier(id, parsed.data);
  if (!row) return fail(404, "SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
  return ok(row);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const res = await archiveWmsSupplier(id);
  if (!res.ok) return fail(404, "SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
  return ok({ archived: true });
}
