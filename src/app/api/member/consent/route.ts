import { z } from "zod";

import { getMarketingConsent, recordMarketingConsent } from "@/lib/customer-experience-service";
import { requireMemberAuth } from "@/lib/member-auth";
import { readMemberJson, successJson } from "@/lib/member-types";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Izin promosi WhatsApp milik member sendiri (CX Engine V4). Append-only: setiap
// perubahan = baris baru dengan waktu & sumber; berhenti promosi kapan saja.
const consentSchema = z.object({
  granted: z.boolean(),
  source: z.enum(["member_profile", "invoice_member"]).default("member_profile"),
});

export async function GET(request: Request) {
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;
  return successJson(await getMarketingConsent(session.data.customer.id));
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "member-consent", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireMemberAuth(request);
  if (session.response) return session.response;
  const body = await readMemberJson(request, consentSchema);
  if (body.response) return body.response;
  return successJson(
    await recordMarketingConsent({
      customerId: session.data.customer.id,
      granted: body.data.granted,
      source: body.data.source,
    }),
  );
}
