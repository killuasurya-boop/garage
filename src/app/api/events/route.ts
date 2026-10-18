import { fail, ok } from "@/lib/api-response";
import { listEventsForAdmin } from "@/lib/event-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  try {
    return ok({ events: await listEventsForAdmin() });
  } catch (error) {
    console.error("[events] list failed", error);
    return fail(500, "EVENTS_FAILED", "Gagal memuat event.");
  }
}
