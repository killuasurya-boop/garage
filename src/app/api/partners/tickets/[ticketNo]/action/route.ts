import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { actOnPartnerTicketAsStaff } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { rateLimit } from "@/lib/rate-limit";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["accept", "start", "ready", "reject"]),
  reason: z.string().trim().max(300).optional(),
});

// Staf Garage memproses pesanan mitra ATAS NAMA mitra (HP mitra mati / mitra sibuk).
// Semua staf boleh (keputusan Owner 15 Nov 2026). Aturan transisi = portal mitra; staf tercatat di audit.
export async function POST(request: Request, context: { params: Promise<{ ticketNo: string }> }) {
  const limited = rateLimit(request, "staff-partner-ticket-action", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { ticketNo } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => actOnPartnerTicketAsStaff(session.data, ticketNo, body.data.action, body.data.reason));
}
