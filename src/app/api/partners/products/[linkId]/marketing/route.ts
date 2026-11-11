import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { partnerMarketingStatus, setPartnerWebsitePromotion } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Syarat & pilihan media marketing website untuk satu produk mitra (pilih = Owner, dicek ulang di server).
export async function GET(_request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  return partnerRoute(() => partnerMarketingStatus(linkId, session.data));
}

export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, z.object({ promoted: z.boolean() }));
  if (body.error) return body.error;
  return partnerRoute(() => setPartnerWebsitePromotion(linkId, body.data.promoted, session.data));
}
