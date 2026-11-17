import { readJson } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { taskPatchSchema, updateTask } from "@/lib/event-lineup-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ubah tugas panitia / status (selesai mencatat waktu selesai). Manajer: status saja (GIGS EO #9). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const body = await readJson(request, taskPatchSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return lineupRoute(() => updateTask(id, body.data, session.data));
}
