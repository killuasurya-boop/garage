import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { decidePartnerPriceProposal } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  approve: z.boolean(),
  unitCost: z.number().int().positive().max(10_000_000).nullable().optional(),
  sellPrice: z.number().int().positive().max(10_000_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

// Keputusan Owner atas pengajuan harga mitra (service menolak selain Owner). Setuju = harga master + histori berubah.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => decidePartnerPriceProposal(id, body.data, session.data));
}
