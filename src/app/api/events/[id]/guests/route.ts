import { ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { createGuest, guestInputSchema, listGuests } from "@/lib/event-invitations";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  try {
    const guests = await listGuests(id, {
      q: url.searchParams.get("q") ?? undefined,
      status: status === "archived" || status === "all" ? status : "active",
    });
    return ok({ guests });
  } catch (error) {
    return eventErrorResponse(error, "Gagal memuat tamu.");
  }
}

export async function POST(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const bad = invalidId(id);
  if (bad) return bad;
  const body = await readJson(request, guestInputSchema);
  if (body.error) return body.error;
  try {
    const guest = await createGuest(id, body.data, eventActor(session.data));
    return ok({ guest: { id: guest.id } }, { status: 201 });
  } catch (error) {
    return eventErrorResponse(error, "Gagal menambah tamu.");
  }
}
