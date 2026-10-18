import { ok } from "@/lib/api-response";
import { eventErrorResponse, invalidId } from "@/lib/event-api";
import { getEventSummary } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  try {
    return ok({ summary: await getEventSummary(id) });
  } catch (error) {
    return eventErrorResponse(error, "Gagal memuat rekap.");
  }
}
