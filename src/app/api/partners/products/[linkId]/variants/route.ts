import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { addPartnerVariant, removePartnerVariant } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const addSchema = z.object({
  label: z.string().trim().min(1).max(40),
  unitCost: z.number().int().min(0),
  sellPrice: z.number().int().positive(),
  reason: z.string().trim().max(300).default("Varian baru"),
});
const removeSchema = z.object({ variantId: z.string().trim().min(1).max(60), reason: z.string().trim().min(3, "Alasan wajib diisi.").max(300) });

// Varian produk mitra (Owner; dicek ulang di server).
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, addSchema);
  if (body.error) return body.error;
  return partnerRoute(() => addPartnerVariant(linkId, body.data, session.data), 201);
}

export async function DELETE(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, removeSchema);
  if (body.error) return body.error;
  return partnerRoute(() => removePartnerVariant(linkId, body.data.variantId, body.data.reason, session.data));
}
