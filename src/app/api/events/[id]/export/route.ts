import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { exportGuestsCsv } from "@/lib/event-invitations";
import { createAuditLog } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Ekspor CSV daftar tamu + RSVP — Owner saja; setiap ekspor tercatat di Audit.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:export");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  try {
    const result = await exportGuestsCsv(id);
    await createAuditLog({
      actor: eventActor(session.data).name,
      action: "Event: ekspor data tamu",
      object: result.filename,
      device: session.data.profile.deviceLabel ?? "OS",
      metadata: { eventId: id, rows: result.rows },
    }).catch(() => undefined);
    return new Response(result.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return eventErrorResponse(error, "Gagal mengekspor data tamu.");
  }
}
