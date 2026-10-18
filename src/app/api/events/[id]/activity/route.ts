import { ok } from "@/lib/api-response";
import { eventErrorResponse, invalidId } from "@/lib/event-api";
import { listEventActivity } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Log aktivitas undangan & RSVP — Owner saja (izin ekspor/audit data tamu).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:export");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  try {
    return ok({ activity: await listEventActivity(id) });
  } catch (error) {
    return eventErrorResponse(error, "Gagal memuat log.");
  }
}
