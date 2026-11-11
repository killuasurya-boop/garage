import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { createPartnerSettlement, listPartnerSettlements } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  partnerId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const partnerId = new URL(request.url).searchParams.get("partnerId") || undefined;
  return partnerRoute(() => listPartnerSettlements(session.data.profile.outlet.id, partnerId));
}

// Draft closing/settlement per mitra (kasir boleh menyusun & mengajukan; persetujuan = Owner).
export async function POST(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const from = new Date(`${body.data.from}T00:00:00+07:00`);
  const to = new Date(new Date(`${body.data.to}T00:00:00+07:00`).getTime() + 86_400_000);
  return partnerRoute(() => createPartnerSettlement({ partnerId: body.data.partnerId, from, to, note: body.data.note }, session.data), 201);
}
