import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { actOnPartnerTicket } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "start", "ready", "reject"]),
  reason: z.string().trim().max(300).optional(),
});

// Terima → Mulai Proses → Siap Antar (atau Tolak + alasan). Transisi divalidasi server, terkunci per tiket.
export async function POST(request: Request, context: { params: Promise<{ ticketNo: string }> }) {
  const limited = rateLimit(request, "partner-ticket-action", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { ticketNo } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => actOnPartnerTicket(session.data, ticketNo, body.data.action, body.data.reason));
}
