import { readJson } from "@/lib/api-response";
import { addInkind, inkindSchema } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Catat sponsor barang (tidak masuk buku kas / laba rugi). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = await readJson(request, inkindSchema);
  if (body.error) return body.error;
  return sponsorRoute(() => addInkind(id, body.data, session.data), 201);
}
