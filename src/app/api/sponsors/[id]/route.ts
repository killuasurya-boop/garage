import { readJson } from "@/lib/api-response";
import { getSponsor, sponsorUpdateSchema, updateSponsor } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  return sponsorRoute(() => getSponsor(id, session.data));
}

/** Ubah data kesepakatan (nama, paket, nilai, kontak). Diaudit sebelum/sesudah. */
export async function PATCH(request: Request, context: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, sponsorUpdateSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => updateSponsor(id, body.data, session.data));
}
