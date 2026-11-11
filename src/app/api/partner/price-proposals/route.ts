import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { listPartnerPriceProposals, submitPartnerPriceProposal } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pengajuan harga milik mitra yang login (partner_id dari sesi). Harga master berubah hanya setelah Owner setuju.
export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  return partnerRoute(() =>
    listPartnerPriceProposals({ outletId: session.data.partner.outletId, partnerId: session.data.partner.id, withImpact: false, limit: 50 }),
  );
}

const schema = z.object({
  linkId: z.string().uuid(),
  variantId: z.string().min(1).max(80),
  proposedUnitCost: z.number().int().positive().max(10_000_000),
  suggestedSellPrice: z.number().int().positive().max(10_000_000).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => submitPartnerPriceProposal(session.data, body.data), 201);
}
