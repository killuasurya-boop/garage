import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { applyPartnerMarginRule } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  margin: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(3, "Alasan wajib diisi.").max(300),
});

// Aturan harga per mitra: harga jual = HPP + laba per unit (Owner; dicatat di riwayat harga).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => applyPartnerMarginRule(id, body.data, session.data));
}
