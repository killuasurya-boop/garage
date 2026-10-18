import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { createInvitations } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Buat undangan untuk tamu terpilih (guestIds) atau semua tamu aktif yang belum punya.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  const body = await readJson(request, z.object({ guestIds: z.array(z.string().uuid()).max(2000).nullable() }));
  if (body.error) return body.error;
  try {
    return ok(await createInvitations(id, body.data.guestIds, eventActor(session.data)), { status: 201 });
  } catch (error) {
    return eventErrorResponse(error, "Gagal membuat undangan.");
  }
}
