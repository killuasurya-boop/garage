import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { applyPartnerStatusAction } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["activate", "freeze", "deactivate", "reopen"]),
  reason: z.string().trim().min(3, "Alasan wajib diisi.").max(300),
});

// Aksi status dari daftar mitra. Jalur & hak akses dihitung server (partnerStatusActions + changePartnerStatus).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => applyPartnerStatusAction(id, body.data.kind, body.data.reason, session.data));
}
