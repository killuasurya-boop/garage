import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { recordSettlementPdfSent } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { rateLimit } from "@/lib/rate-limit";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ channel: z.enum(["share", "wa_desktop"]) });

// A7: catat "PDF settlement sudah dikirim ke mitra" (siapa & kapan). Peran sama dengan yang boleh membuka settlement.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "partner-settlement-sent", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => recordSettlementPdfSent(id, body.data.channel, session.data));
}
