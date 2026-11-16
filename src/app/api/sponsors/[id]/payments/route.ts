import { readJson } from "@/lib/api-response";
import { paymentSchema, recordSponsorPayment } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Uang sponsor masuk Rekening Jago → satu baris buku kas `sponsor_income` (idempoten). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, paymentSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => recordSponsorPayment(id, body.data, session.data), 201);
}
