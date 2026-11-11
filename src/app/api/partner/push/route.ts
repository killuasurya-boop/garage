import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { subscribePartnerPush, unsubscribePartnerPush } from "@/lib/web-push-sender";

export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

// Langganan push HP mitra (pesanan baru saat layar terkunci). partner_id selalu dari sesi.
export async function POST(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, subscribeSchema);
  if (body.error) return body.error;
  return ok(await subscribePartnerPush({ partnerId: session.data.partner.id, accountId: session.data.account.id, endpoint: body.data.endpoint, keys: body.data.keys }), { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const body = await readJson(request, unsubscribeSchema);
  if (body.error) return body.error;
  return ok(await unsubscribePartnerPush(session.data.partner.id, body.data.endpoint));
}
