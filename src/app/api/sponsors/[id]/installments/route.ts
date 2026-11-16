import { readJson } from "@/lib/api-response";
import { installmentsSchema, setInstallments } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ganti seluruh jadwal cicilan (total tidak boleh melebihi nilai kesepakatan). */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, installmentsSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => setInstallments(id, body.data, session.data));
}
