import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { panitiaCreateTask, panitiaTaskInputSchema } from "@/lib/event-panitia-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Buat tugas panitia (Ketua/Sekretaris event itu saja). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const body = await readJson(request, panitiaTaskInputSchema);
  if (body.error) return body.error;
  return lineupRoute(() => panitiaCreateTask(body.data, session.data), 201);
}
