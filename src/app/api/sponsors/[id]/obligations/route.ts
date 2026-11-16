import { readJson } from "@/lib/api-response";
import { addObligation, obligationSchema } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tambah kewajiban ke sponsor (logo di poster, disebut MC, booth, posting IG…). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, obligationSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => addObligation(id, body.data, session.data), 201);
}
