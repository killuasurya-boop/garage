import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { reorderPerformers, reorderSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Simpan urutan slot lineup satu event. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, reorderSchema);
  if (body.error) return body.error;
  return lineupRoute(() => reorderPerformers(body.data, session.data));
}
