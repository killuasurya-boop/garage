import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { decideWmsWaste } from "@/lib/wms-waste";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });

/** Setujui / tolak waste bernilai besar yang diajukan staf. Owner/Manajer. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    const row = await decideWmsWaste(id, parsed.data, { userId: session.data.user.id });
    if (!row) return fail(404, "WMS_WASTE_NOT_FOUND", "Waste tidak ditemukan.");
    return ok(row);
  } catch (e) {
    return fail(400, "WMS_WASTE_DECIDE_FAILED", e instanceof Error ? e.message : "Gagal memutuskan waste.");
  }
}
