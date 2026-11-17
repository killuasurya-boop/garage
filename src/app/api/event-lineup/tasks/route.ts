import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { createTask, taskInputSchema } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tambah tugas panitia (penanggung jawab, tenggat, prioritas). */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, taskInputSchema);
  if (body.error) return body.error;
  return lineupRoute(() => createTask(body.data, session.data), 201);
}
