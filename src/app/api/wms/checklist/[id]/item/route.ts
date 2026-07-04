import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { toggleChecklistItem } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  itemId: z.string().uuid(),
  checked: z.boolean(),
  note: z.string().max(200).optional(),
});

export async function PATCH(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const row = await toggleChecklistItem(parsed.data.itemId, parsed.data.checked, parsed.data.note);
  if (!row) return fail(404, "ITEM_NOT_FOUND", "Item checklist tidak ditemukan.");
  return ok(row);
}
