import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { decideInternalOrder } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() });

// Setujui (stok gudang → outlet) atau tolak permintaan internal order staf.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    return ok(await decideInternalOrder(id, parsed.data, { id: session.data.user.id, role: session.data.profile.role }));
  } catch (e) {
    return fail(400, "IO_DECISION_FAILED", e instanceof Error ? e.message : "Gagal memproses internal order.");
  }
}
